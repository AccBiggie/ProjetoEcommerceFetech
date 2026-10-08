const { readCents, sumCents, multiplyCents, addCents, formatCentsToDecimal } = require('../utils/money');
const crypto = require("crypto");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { normalizeShippingAddress } = require('../../shared/shippingAddress.mjs');

exports.newOrder = catchAsyncErrors(async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next(new ErrorHander("Dados do pedido inválidos.", 400));
    if (!Array.isArray(req.body.orderItems) || !req.body.orderItems.length) return next(new ErrorHander("O pedido precisa conter produtos.", 400));
    const shippingInfo = normalizeShippingAddress(req.body.shippingInfo);
    const quantities = new Map();
    for (const item of req.body.orderItems) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.product !== 'string' || !/^[0-9a-fA-F]{24}$/.test(item.product)) return next(new ErrorHander("Produto inválido no pedido.", 400));
        const quantity = item.quantity;
        if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) return next(new ErrorHander("Quantidade inválida.", 400));
        const productId = item.product.toLowerCase();
        quantities.set(productId, addCents(quantities.get(productId) || 0, quantity));
    }
    const orderItems = [];
    for (const [id, quantity] of quantities) {
        const product = await Product.findById(id);
        if (!product) return next(new ErrorHander("Um produto do pedido não existe mais.", 404));
        if (quantity > product.Stock) return next(new ErrorHander("Estoque insuficiente para " + product.name, 400));
        const priceCents = readCents(product, 'price');
        orderItems.push({ product: product._id, name: product.name, priceCents, quantity, image: product.images[0]?.url || "/Profile.png" });
    }
    const itemsPriceCents = sumCents(orderItems.map(item => multiplyCents(item.priceCents, item.quantity)));
    // Nenhum provedor de pagamento foi integrado: o pedido permanece pendente.
    const order = await Order.create({
        shippingInfoVersion: 2, shippingInfo, orderItems, user: req.user._id,
        itemsPriceCents, taxPriceCents: 0, shippingPriceCents: 0, totalPriceCents: itemsPriceCents,
        paymentInfo: { id: crypto.randomUUID(), status: "Pending" },
    });
    res.status(201).json({ success: true, order });
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
