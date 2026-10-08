const { readCents, sumCents, multiplyCents, formatCentsToDecimal } = require('../utils/money');
const crypto = require("crypto");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { canonicalCheckout, serializeOrderIntent } = require('../../shared/orderIntent.mjs');
const { createOrderIdempotencyService, requestKey } = require('../services/orderIdempotencyService');
const idempotency = createOrderIdempotencyService();

exports.newOrder = catchAsyncErrors(async (req, res) => {
    const intent = canonicalCheckout(req.body);
    const key = requestKey(req);
    try {
        const result = await idempotency.execute({
            user: req.user._id, key, canonical: serializeOrderIntent(intent),
            prepare: async () => {
                const orderItems = [];
                for (const item of intent.orderItems) {
                    const product = await Product.findById(item.product);
                    if (!product) throw new ErrorHander("Um produto do pedido n\u00e3o existe mais.", 404);
                    if (item.quantity > product.Stock) throw new ErrorHander("Estoque insuficiente para " + product.name, 400);
                    orderItems.push({ product: product._id, name: product.name, priceCents: readCents(product, 'price'),
                        quantity: item.quantity, image: product.images[0]?.url || "/Profile.png" });
                }
                const itemsPriceCents = sumCents(orderItems.map(item => multiplyCents(item.priceCents, item.quantity)));
                return { orderItems, itemsPriceCents };
            },
            create: (prepared, hashes) => Order.create({
                ...hashes, shippingInfoVersion: 2, shippingInfo: intent.shippingInfo,
                orderItems: prepared.orderItems, user: req.user._id,
                itemsPriceCents: prepared.itemsPriceCents, taxPriceCents: 0, shippingPriceCents: 0, totalPriceCents: prepared.itemsPriceCents,
                paymentInfo: { id: crypto.randomUUID(), status: "Pending" },
            }),
        });
        if (result.replayed) res.set('Idempotency-Replayed', 'true');
        res.status(201).json({ success: true, order: result.order });
    } catch (error) {
        if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
        throw error;
    }
});
exports.getSingleOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    if (req.user.role !== "admin" && order.user?._id.toString() !== req.user.id) return next(new ErrorHander("Você não pode acessar este pedido.", 403));
    res.json({ success: true, order });
});
exports.myOrders = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, orders: await Order.find({ user: req.user._id }).sort({ createdAt: -1 }) });
});
exports.getAllOrders = catchAsyncErrors(async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    const totalAmountCents = sumCents(orders.map(order => readCents(order, 'totalPrice')));
    res.json({ success: true, totalAmountCents, totalAmount: formatCentsToDecimal(totalAmountCents), orders });
});
exports.updateOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findById(req.params.id);
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    const allowed = { Processing: "Shipped", Shipped: "Delivered" };
    if (req.body.status !== allowed[order.orderStatus]) return next(new ErrorHander("Transição de status inválida.", 400));
    const decremented = [];
    try {
        if (req.body.status === "Shipped") {
            for (const item of order.orderItems) {
                const updated = await Product.findOneAndUpdate({ _id: item.product, Stock: { $gte: item.quantity } }, { $inc: { Stock: -item.quantity } });
                if (!updated) throw new ErrorHander("Produto indisponível ou sem estoque para envio.", 400);
                decremented.push(item);
            }
        }
        order.orderStatus = req.body.status;
        if (req.body.status === "Delivered") order.deliveredAt = new Date();
        await order.save();
    } catch (error) {
        for (const item of decremented) await Product.updateOne({ _id: item.product }, { $inc: { Stock: item.quantity } });
        throw error;
    }
    res.json({ success: true, order });
});
exports.deleteOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    res.json({ success: true });
});
