async function auditOrders(connection, { write = console.log, lifecycle = false, session } = {}) {
    const orders = await connection.db.collection('orders').find({}, { session, projection: { _id: 1, administrativeArchivedAt: 1, administrativeArchivedBy: 1, inventoryStatus: 1, inventoryVersion: 1, inventoryReservedAt: 1, cancelledAt: 1, shippedAt: 1, deliveredAt: 1, 'orderItems.product': 1, 'orderItems.quantity': 1, orderStatus: 1, paymentStatus: 1, paidAt: 1 } }).toArray();
    const claims = await connection.db.collection('orderidempotencies').find({ status: 'COMPLETED' }, { session, projection: { _id: 1, order: 1 } }).toArray();
    const movements = await connection.db.collection('stockmovements').find({}, { session, projection: { _id: 1, order: 1, product: 1, type: 1, quantity: 1, delta: 1, stockBefore: 1, stockAfter: 1, actorUserId: 1, reason: 1 } }).toArray();
    const ids = new Set(orders.map(order => String(order._id))), issues = [];
    const add = (category, id) => issues.push({ category, id: String(id) });
    let archived = 0;
    for (const order of orders) {
        const confirmed = require('./orderPayment').paymentConfirmed(order);
        if (order.paymentStatus == null) add('LEGACY_PAYMENT_UNVERIFIED', order._id);
        else if (!['PENDING', 'PAID'].includes(order.paymentStatus)) add('UNKNOWN_PAYMENT_STATUS', order._id);
        if (order.paymentStatus === 'PAID' && !confirmed) add('PAID_WITHOUT_PAID_AT', order._id);
        if (order.paidAt != null && order.paymentStatus !== 'PAID') add('PAID_AT_WITHOUT_PAID_STATUS', order._id);
        if (order.orderStatus === 'Shipped' && !confirmed) add('SHIPPED_WITHOUT_CONFIRMED_PAYMENT', order._id);
        if (order.orderStatus === 'Delivered' && !confirmed) add('DELIVERED_WITHOUT_CONFIRMED_PAYMENT', order._id);
        const at = order.administrativeArchivedAt, by = order.administrativeArchivedBy;
        if ((at != null) !== (by != null) || (at != null && (!(at instanceof Date) || !Number.isFinite(at.getTime()))) ||
            (by != null && by._bsontype !== 'ObjectId')) add('INVALID_ARCHIVE_METADATA', order._id);
        else if (at != null) archived++;
        if (order.inventoryStatus === 'RESERVED') for (const item of order.orderItems || []) {
            if (!movements.some(row => String(row.order) === String(order._id) && String(row.product) === String(item.product) && row.type === 'RESERVE')) add('MISSING_RESERVE', order._id);
        }
    }
    for (const claim of claims) if (!ids.has(String(claim.order))) add('COMPLETED_WITHOUT_ORDER', claim._id);
    for (const movement of movements) if (movement.type === 'RESERVE' && !ids.has(String(movement.order))) add('ORPHAN_MOVEMENT', movement._id);
    if (lifecycle) await require('./orderLifecycleAudit').auditLifecycle(connection, orders, movements, add, session);
    const summary = { mode: 'READ_ONLY', orders: orders.length, active: orders.length - archived, archived, issues: issues.length };
    write(JSON.stringify(summary)); issues.forEach(issue => write(JSON.stringify(issue)));
    return { summary, issues };
}
module.exports = { auditOrders };
