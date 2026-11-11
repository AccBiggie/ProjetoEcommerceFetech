const { date } = require('./orderCancellation');
const { validMovement } = require('./stockMovementContract');
async function auditLifecycle(connection, orders, movements, add, session) {
  const outbox = await connection.db.collection('emailoutboxes').find({ eventType: 'ORDER_CANCELLED' }, { session, projection: { entityId: 1, dedupeKey: 1 } }).toArray();
  for (const order of orders) {
    const released = movements.filter(m => m.type === 'RELEASE' && String(m.order) === String(order._id));
    if (!['RESERVED', 'RELEASED'].includes(order.inventoryStatus) || order.inventoryVersion !== 1 || !date(order.inventoryReservedAt)) add('ORDER_LEGACY_INVENTORY_UNVERIFIED', order._id);
    if (order.orderStatus !== 'Cancelled') {
      if (order.inventoryStatus === 'RELEASED' || released.length) add('ORDER_RELEASE_WITHOUT_CANCELLATION', order._id);
      continue;
    }
    if (order.inventoryStatus !== 'RELEASED') add('ORDER_CANCELLED_WITH_RESERVED_INVENTORY', order._id);
    if (!date(order.cancelledAt)) add('ORDER_CANCELLED_WITHOUT_CANCELLED_AT', order._id);
    if (order.shippedAt != null) add('ORDER_CANCELLED_WITH_SHIPPED_STATE', order._id);
    if (order.deliveredAt != null) add('ORDER_CANCELLED_WITH_DELIVERED_STATE', order._id);
    if (order.paymentStatus === 'PAID' || order.paidAt != null) add('ORDER_CANCELLED_WITH_PAID_STATE', order._id);
    if (order.paymentStatus !== 'PENDING') add('ORDER_CANCELLED_WITH_UNVERIFIED_PAYMENT', order._id);
    if (!order.orderItems?.length) add('ORDER_RELEASE_MOVEMENT_MISSING', order._id);
    for (const item of order.orderItems || []) {
      const rows = released.filter(m => String(m.product) === String(item.product));
      if (!rows.length) add('ORDER_RELEASE_MOVEMENT_MISSING', order._id);
      if (rows.length > 1) add('ORDER_RELEASE_MOVEMENT_DUPLICATED', order._id);
      if (rows.some(m => !validMovement(m) || m.quantity !== item.quantity)) add('ORDER_RELEASE_MOVEMENT_INCOHERENT', order._id);
    }
    if (released.some(m => !(order.orderItems || []).some(i => String(i.product) === String(m.product)))) add('ORDER_RELEASE_MOVEMENT_UNEXPECTED', order._id);
    const events = outbox.filter(e => String(e.entityId) === String(order._id));
    if (!events.length) add('ORDER_CANCEL_EVENT_MISSING', order._id);
    if (events.length > 1) add('ORDER_CANCEL_EVENT_DUPLICATED', order._id);
  }
}
module.exports = { auditLifecycle };
