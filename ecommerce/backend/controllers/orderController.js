const history = require('../services/orderHistoryService');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const ErrorHander = require('../utils/errorHander');
const catchAsyncErrors = require('../middleware/catchAsyncErrors');
const { readCents, sumCents, formatCentsToDecimal } = require('../utils/money');
const { canonicalCheckout, serializeOrderIntent } = require('../../shared/orderIntent.mjs');
const { createOrderIdempotencyService, requestKey } = require('../services/orderIdempotencyService');
const inventory = require('../services/orderInventoryService').createOrderInventoryService();
const idempotency = createOrderIdempotencyService();
exports.newOrder = catchAsyncErrors(async (req, res) => {
    const intent = canonicalCheckout(req.body), key = requestKey(req);
    try {
        const result = await idempotency.execute({ user: req.user._id, key, canonical: serializeOrderIntent(intent),
            prepare: () => inventory.prepare(intent),
            create: (_prepared, hashes, complete) => inventory.create({ intent, user: req.user._id, hashes, complete }),
        });
        if (result.replayed) res.set('Idempotency-Replayed', 'true');
        res.status(201).json({ success: true, order: result.order });
    } catch (error) { if (error.retryAfter) res.set('Retry-After', String(error.retryAfter)); throw error; }
});
exports.getSingleOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findById(req.params.id).select(req.user.role === 'admin' ? history.fields : '').populate("user", "name email");
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    if (req.user.role !== "admin" && order.user?._id.toString() !== req.user.id) return next(new ErrorHander("Você não pode acessar este pedido.", 403));
    res.json({ success: true, order: req.user.role === 'admin' ? history.adminOrder(order) : order });
});
exports.myOrders = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, orders: await Order.find({ user: req.user._id }).sort({ createdAt: -1 }) });
});
exports.getAllOrders = catchAsyncErrors(async (req, res) => {
    const params = new URL(req.originalUrl, 'http://localhost').searchParams;
    if (params.getAll('archived').length > 1 || [...params.keys()].some(key => key.startsWith('archived['))) throw new ErrorHander('Filtro de arquivamento inválido.', 400);
    const orders = await Order.find(history.archiveFilter(req.query.archived)).select(history.fields).sort({ createdAt: -1 });
    const totalAmountCents = sumCents(orders.map(order => readCents(order, 'totalPrice')));
    res.json({ success: true, totalAmountCents, totalAmount: formatCentsToDecimal(totalAmountCents), orders: orders.map(history.adminOrder) });
});
exports.updateOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findById(req.params.id).select(history.fields);
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    const allowed = { Processing: "Shipped", Shipped: "Delivered" };
    if (req.body.status !== allowed[order.orderStatus]) return next(new ErrorHander("Transição de status inválida.", 400));
    const decremented = [];
    try {
        if (req.body.status === "Shipped" && order.inventoryStatus !== "RESERVED") {
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
    res.json({ success: true, order: history.adminOrder(order) });
});
exports.deleteOrder = (_req, res) => {
    res.set('Allow', 'PATCH').status(405).json({ success: false, message: 'Pedidos não podem ser excluídos fisicamente.' });
};
exports.archiveOrder = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, order: await history.setArchived(req.params.id, req.user._id, true) });
});
exports.unarchiveOrder = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, order: await history.setArchived(req.params.id, req.user._id, false) });
});
