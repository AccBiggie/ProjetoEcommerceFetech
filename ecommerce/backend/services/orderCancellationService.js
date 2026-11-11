const { cancellationEligibility, messages } = require('../utils/orderCancellation');
const { inventoryError, validStock } = require('../utils/inventory');
const { validMovement } = require('../utils/stockMovementContract');
const history = require('./orderHistoryService');
const ErrorHander = require('../utils/errorHander');
function createOrderCancellationService({ Order = require('../models/orderModel'), Product = require('../models/productModel'), Movement = require('../models/stockMovementModel'), enqueue = require('./email/enqueue').enqueue } = {}) {
  async function cancel({ id, actor, admin = false, requestId, session }) {
    if (!session?.inTransaction()) throw new Error('Cancellation requires transaction');
    const order = await Order.findOne({ _id: id, ...(admin ? {} : { user: actor }) }).select(history.fields).session(session).lean();
    if (!order) throw new ErrorHander('Pedido não encontrado.', 404);
    const eligibility = cancellationEligibility(order);
    if (eligibility.blockedReason === 'ORDER_ALREADY_CANCELLED') return { value: order };
    if (!eligibility.canCancel) throw inventoryError(eligibility.blockedReason, messages[eligibility.blockedReason]);
    const unverified = () => inventoryError('ORDER_INVENTORY_UNVERIFIED', messages.ORDER_INVENTORY_UNVERIFIED);
    const items = order.orderItems;
    if (!Array.isArray(items) || !items.length || new Set(items.map(i => String(i.product))).size !== items.length) throw unverified();
    const movements = await Movement.find({ order: order._id }).session(session).lean();
    if (movements.length !== items.length || movements.some(m => m.type !== 'RESERVE' || !validMovement(m))) throw unverified();
    for (const item of items) {
      if (!validStock(item.quantity) || item.quantity === 0 || !movements.some(m => String(m.product) === String(item.product) && m.quantity === item.quantity && m.version === 1)) throw unverified();
    }
    const cancelledAt = new Date(), reason = admin ? 'ADMIN_REQUEST' : 'CUSTOMER_REQUEST';
    // Writing Order fences simultaneous cancel/archive/fulfillment changes across instances.
    const updated = await Order.findOneAndUpdate({ _id: order._id, orderStatus: 'Processing', paymentStatus: 'PENDING',
      paidAt: null, deliveredAt: null, shippedAt: null, cancelledAt: null, inventoryStatus: 'RESERVED', inventoryVersion: 1 },
      { $set: { orderStatus: 'Cancelled', inventoryStatus: 'RELEASED', cancelledAt, cancelledByUserId: actor,
        cancellationSource: admin ? 'ADMIN' : 'CUSTOMER', cancellationReasonCode: reason } },
      { session, runValidators: true, returnDocument: 'after' }).select(history.fields).lean();
    if (!updated) throw inventoryError('ORDER_NOT_CANCELLABLE', messages.ORDER_NOT_CANCELLABLE);
    for (const item of [...items].sort((a, b) => String(a.product).localeCompare(String(b.product)))) {
      const previous = await Product.findOneAndUpdate({ _id: item.product, Stock: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - item.quantity } },
        { $inc: { Stock: item.quantity } }, { session, returnDocument: 'before', lean: true });
      if (!previous || !validStock(previous.Stock) || !validStock(previous.Stock + item.quantity)) throw unverified();
      await Movement.create([{ product: item.product, order: order._id, type: 'RELEASE', version: 1, quantity: item.quantity,
        delta: item.quantity, stockBefore: previous.Stock, stockAfter: previous.Stock + item.quantity,
        actorUserId: actor, reason: 'ORDER_CANCELLED' }], { session });
    }
    await enqueue({ eventType: 'ORDER_CANCELLED', recipientUserId: order.user, entityId: order._id, requestId }, session, Order.db);
    return { value: updated, ...(admin ? { event: { action: 'ORDER_CANCELLED', targetId: order._id, metadata: { reasonCode: reason } } } : {}) };
  }
  return { cancel };
}
module.exports = { createOrderCancellationService };
