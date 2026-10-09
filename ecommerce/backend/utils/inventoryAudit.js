const { validStock } = require('./inventory');
async function auditInventory(connection, { write = console.log } = {}) {
    const issues = [];
    const add = (category, entity, id) => issues.push({ category, entity, id: String(id) });
    // Driver bruto, projeções restritas: nenhuma validação/casting ou escrita de models.
    const products = await connection.collection('products').find({}, { projection: { _id: 1, Stock: 1 } }).toArray();
    const orders = await connection.collection('orders').find({}, { projection: { _id: 1, inventoryStatus: 1, inventoryVersion: 1,
        inventoryReservedAt: 1, 'orderItems.product': 1, 'orderItems.quantity': 1 } }).toArray();
    const movements = await connection.collection('stockmovements').find({}, { projection: { _id: 1, product: 1, order: 1, type: 1,
        quantity: 1, stockBefore: 1, stockAfter: 1, delta: 1, actorUserId: 1, reason: 1 } }).toArray();
    const claims = await connection.collection('orderidempotencies').find({ status: 'COMPLETED' }, { projection: { _id: 1, order: 1 } }).toArray();
    const byOrder = new Map(orders.map(order => [String(order._id), order])), seen = new Set();
    for (const product of products) if (!validStock(product.Stock)) add('INVALID_STOCK', 'product', product._id);
    for (const order of orders) {
        if ((order.inventoryVersion === 1 || order.inventoryReservedAt) && order.inventoryStatus !== 'RESERVED') add('MISSING_INVENTORY_STATUS', 'order', order._id);
        if (order.inventoryStatus !== 'RESERVED') continue; // Não inventar baseline legado.
        for (const item of order.orderItems || []) {
            const rows = movements.filter(m => String(m.order) === String(order._id) && String(m.product) === String(item.product) && m.type === 'RESERVE');
            if (!rows.length) add('MISSING_RESERVE', 'order', order._id);
            if (rows.some(m => m.quantity !== item.quantity)) add('QUANTITY_MISMATCH', 'order', order._id);
        }
    }
    for (const movement of movements) {
        if (movement.type !== 'RESERVE') {
            if (!require('./stockMovementContract').validMovement(movement)) add('INCOHERENT_MOVEMENT', 'movement', movement._id);
            if (!products.some(p => String(p._id) === String(movement.product))) add('ORPHAN_MOVEMENT', 'movement', movement._id);
            continue;
        }
        const order = byOrder.get(String(movement.order));
        if (!order) add('ORPHAN_MOVEMENT', 'movement', movement._id);
        else if (!(order.orderItems || []).some(item => String(item.product) === String(movement.product))) add('UNEXPECTED_MOVEMENT', 'movement', movement._id);
        if (movement.type !== 'RESERVE' || !validStock(movement.quantity) || movement.quantity === 0 ||
            !validStock(movement.stockBefore) || !validStock(movement.stockAfter) || movement.stockAfter !== movement.stockBefore - movement.quantity) add('INCOHERENT_MOVEMENT', 'movement', movement._id);
        const key = `${movement.order}/${movement.product}/${movement.type}`;
        if (seen.has(key)) add('DUPLICATE_MOVEMENT', 'movement', movement._id);
        seen.add(key);
    }
    for (const claim of claims) if (!byOrder.has(String(claim.order))) add('COMPLETED_WITHOUT_ORDER', 'claim', claim._id);
    const summary = { mode: 'READ_ONLY', products: products.length, orders: orders.length, movements: movements.length, issues: issues.length };
    write(JSON.stringify(summary)); for (const issue of issues) write(JSON.stringify(issue));
    return { summary, issues };
}
module.exports = { auditInventory };
