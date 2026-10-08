const history = require('../services/orderHistoryService');
const { runAuditedAdminMutation } = require('../services/adminAuditService');
const Order = require('../models/orderModel');
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
        if (result.replayed) { res.set('Idempotency-Replayed', 'true'); require('../observability/logger').info('order.idempotency.replayed', { orderId: String(result.order._id) }); }
        res.status(201).json({ success: true, order: history.customerOrder(result.order) });
    } catch (error) { if (error.retryAfter) res.set('Retry-After', String(error.retryAfter)); require('../observability/logger').warn('order.transaction.failed', { errorCode: error.code }); throw error; }
});
exports.getSingleOrder = catchAsyncErrors(async (req, res, next) => {
    const order = await Order.findById(req.params.id).select(req.user.role === 'admin' ? history.fields : '').populate("user", "name email").lean();
    if (!order) return next(new ErrorHander("Pedido não encontrado.", 404));
    if (req.user.role !== "admin" && order.user?._id.toString() !== req.user.id) return next(new ErrorHander("Você não pode acessar este pedido.", 403));
    res.json({ success: true, order: req.user.role === 'admin' ? history.adminOrder(order) : history.customerOrder(order) });
});
exports.myOrders = catchAsyncErrors(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, orders: orders.map(history.customerOrder) });
});
exports.getAllOrders = catchAsyncErrors(async (req, res) => {
    const params = new URL(req.originalUrl, 'http://localhost').searchParams;
    if (params.getAll('archived').length > 1 || [...params.keys()].some(key => key.startsWith('archived['))) throw new ErrorHander('Filtro de arquivamento inválido.', 400);
    const orders = await Order.find(history.archiveFilter(req.query.archived)).select(history.fields).sort({ createdAt: -1 }).lean();
    const totalAmountCents = sumCents(orders.map(order => readCents(order, 'totalPrice')));
    res.json({ success: true, totalAmountCents, totalAmount: formatCentsToDecimal(totalAmountCents), orders: orders.map(history.adminOrder) });
});
exports.updateOrder = catchAsyncErrors(async (req, res) => {
    const order = await runAuditedAdminMutation(req, async session => {
        let event;
        const value = await require('../services/orderStateMachine').transitionOrder(req.params.id, req.body?.status, { session,
            onChanged: (from, to, targetId) => { event = { action: 'ORDER_STATUS_CHANGED', targetId, metadata: { from, to } }; } });
        return { value, event };
    });
    res.json({ success: true, order: history.adminOrder(order) });
});
exports.deleteOrder = (_req, res) => {
    res.set('Allow', 'PATCH').status(405).json({ success: false, message: 'Pedidos não podem ser excluídos fisicamente.' });
};
const archive = archived => catchAsyncErrors(async (req, res) => {
    const order = await runAuditedAdminMutation(req, async session => {
        let event;
        const value = await history.setArchived(req.params.id, req.user._id, archived, { session,
            onChanged: targetId => { event = { action: archived ? 'ORDER_ARCHIVED' : 'ORDER_UNARCHIVED', targetId, metadata: { archived } }; } });
        return { value, event };
    });
    res.json({ success: true, order });
});
exports.archiveOrder = archive(true);
exports.unarchiveOrder = archive(false);
