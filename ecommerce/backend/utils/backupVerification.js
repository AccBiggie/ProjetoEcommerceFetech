const crypto = require('node:crypto');
const { BSON } = require('mongoose').mongo;
const { fail } = require('./backupContract');
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const canonical = value => JSON.stringify(ordered(JSON.parse(BSON.EJSON.stringify(value, { relaxed: false }))));
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
async function snapshotDatabase(db, { ignore = [] } = {}) {
    const collections = Object.create(null);
    for (const collection of (await db.listCollections({}, { nameOnly: false }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
        if (ignore.includes(collection.name)) continue;
        if (collection.type !== 'collection' || !/^[a-z][a-z0-9_]*$/.test(collection.name)) fail('BACKUP_COLLECTION_UNSUPPORTED', 'Há collection ou view fora do formato suportado; nenhuma cópia foi validada.');
        const hash = crypto.createHash('sha256'); let count = 0;
        for await (const record of db.collection(collection.name).find({}, { promoteValues: false }).sort({ _id: 1 })) { hash.update(canonical(record) + '\n'); count++; }
        const indexes = (await db.collection(collection.name).listIndexes().toArray()).map(index => {
            const { ns, key, ...options } = index;
            return { ...options, key: Object.entries(key) };
        }).sort((a, b) => a.name.localeCompare(b.name));
        collections[collection.name] = { count, dataSha256: hash.digest('hex'), indexCount: indexes.length, indexesSha256: digest(indexes), optionsSha256: digest(collection.options || {}) };
    }
    return collections;
}
async function criticalInvariants(db) {
    const issues = Object.create(null), add = category => { issues[category] = (issues[category] || 0) + 1; };
    const orders = await db.collection('orders').find({}).toArray(), products = await db.collection('products').find({}).toArray();
    const users = await db.collection('users').find({}, { projection: { _id: 1 } }).toArray();
    const movements = await db.collection('stockmovements').find({}).toArray();
    const claims = await db.collection('orderidempotencies').find({ status: 'COMPLETED' }, { projection: { order: 1 } }).toArray();
    const ids = rows => new Set(rows.map(row => String(row._id))), orderIds = ids(orders), productIds = ids(products), userIds = ids(users);
    for (const product of products) if (!require('./inventory').validStock(product.Stock)) add('INVALID_STOCK');
    for (const order of orders) {
        if (!userIds.has(String(order.user))) add('ORDER_USER_MISSING');
        if (order.shippingInfoVersion === 2) {
            try { require('./money').orderMoney(order); } catch { add('INVALID_ORDER_MONEY'); }
            try { if (canonical(require('../../shared/shippingAddress.mjs').normalizeShippingAddress(order.shippingInfo)) !== canonical(order.shippingInfo)) add('INVALID_SHIPPING_SNAPSHOT'); } catch { add('INVALID_SHIPPING_SNAPSHOT'); }
        }
        if (order.paymentStatus === 'PAID' && !require('./orderPayment').paymentConfirmed(order)) add('INVALID_PAID_AT');
        if (order.inventoryStatus === 'RESERVED') for (const item of order.orderItems || []) {
            const rows = movements.filter(row => String(row.order) === String(order._id) && String(row.product) === String(item.product) && row.type === 'RESERVE');
            if (rows.length !== 1 || rows[0]?.quantity !== item.quantity) add('RESERVE_RELATION_INVALID');
        }
    }
    for (const movement of movements) {
        if (!orderIds.has(String(movement.order)) || !productIds.has(String(movement.product))) add('MOVEMENT_RELATION_INVALID');
        if (movement.type === 'RESERVE' && movement.stockAfter !== movement.stockBefore - movement.quantity) add('MOVEMENT_STOCK_INVALID');
    }
    for (const claim of claims) if (!orderIds.has(String(claim.order))) add('IDEMPOTENCY_RELATION_INVALID');
    return issues;
}
async function verifyDatabase(db, manifest, options) {
    const snapshot = await snapshotDatabase(db, options), invariants = await criticalInvariants(db);
    if (canonical(snapshot) !== canonical(manifest.collections) || canonical(invariants) !== canonical(manifest.invariants)) fail('RESTORE_VERIFICATION_FAILED', 'Contagens, dados BSON, índices, opções ou relações restauradas divergem do manifesto.');
    return { verified: true, collections: Object.keys(snapshot).length, documents: Object.values(snapshot).reduce((sum, row) => sum + row.count, 0), historicalIssues: Object.values(invariants).reduce((sum, count) => sum + count, 0) };
}
module.exports = { canonical, digest, snapshotDatabase, criticalInvariants, verifyDatabase };
