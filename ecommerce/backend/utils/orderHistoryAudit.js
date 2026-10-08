async function auditOrders(connection, { write = console.log } = {}) {
    const orders = await connection.db.collection('orders').find({}, { projection: { _id: 1, administrativeArchivedAt: 1, administrativeArchivedBy: 1, inventoryStatus: 1, 'orderItems.product': 1 } }).toArray();
    const claims = await connection.db.collection('orderidempotencies').find({ status: 'COMPLETED' }, { projection: { _id: 1, order: 1 } }).toArray();
    const movements = await connection.db.collection('stockmovements').find({}, { projection: { _id: 1, order: 1, product: 1, type: 1 } }).toArray();
    const ids = new Set(orders.map(order => String(order._id))), issues = [];
    const add = (category, id) => issues.push({ category, id: String(id) });
    let archived = 0;
    for (const order of orders) {
        const at = order.administrativeArchivedAt, by = order.administrativeArchivedBy;
        if ((at != null) !== (by != null) || (at != null && (!(at instanceof Date) || !Number.isFinite(at.getTime()))) ||
            (by != null && by._bsontype !== 'ObjectId')) add('INVALID_ARCHIVE_METADATA', order._id);
        else if (at != null) archived++;
        if (order.inventoryStatus === 'RESERVED') for (const item of order.orderItems || []) {
            if (!movements.some(row => String(row.order) === String(order._id) && String(row.product) === String(item.product) && row.type === 'RESERVE')) add('MISSING_RESERVE', order._id);
        }
    }
    for (const claim of claims) if (!ids.has(String(claim.order))) add('COMPLETED_WITHOUT_ORDER', claim._id);
    for (const movement of movements) if (!ids.has(String(movement.order))) add('ORPHAN_MOVEMENT', movement._id);
    const summary = { mode: 'READ_ONLY', orders: orders.length, active: orders.length - archived, archived, issues: issues.length };
    write(JSON.stringify(summary)); issues.forEach(issue => write(JSON.stringify(issue)));
    return { summary, issues };
}
module.exports = { auditOrders };
