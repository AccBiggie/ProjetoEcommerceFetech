const { productMoney, orderMoney, productFields, orderFields, MoneyError } = require('./money');
function inspectMoneyDocument(kind, document) {
    const fields = kind === 'product' ? productFields : orderFields;
    let normalized;
    try { normalized = kind === 'product' ? productMoney(document) : orderMoney(document); }
    catch (error) {
        if (!(error instanceof MoneyError)) throw error;
        return { status: 'blocked', reason: error.code, id: String(document._id), field: kind === 'product' ? 'product.money' : 'order.money' };
    }
    const legacy = fields.some(field => Object.hasOwn(document, field)) || (kind === 'order' && document.orderItems.some(item => Object.hasOwn(item, 'price')));
    const missing = fields.some(field => document[field+'Cents'] == null) || (kind === 'order' && document.orderItems.some(item => item.priceCents == null));
    if (!legacy && !missing) return { status: 'alreadyMigrated', id: String(document._id) };
    const set = Object.fromEntries(fields.map(field => [field+'Cents', normalized[field+'Cents']]));
    const unset = Object.fromEntries(fields.map(field => [field, '']));
    const filter = { _id: document._id };
    for (const field of fields.flatMap(field => [field,field+'Cents'])) filter[field] = Object.hasOwn(document, field) ? document[field] : { $exists: false };
    if (kind === 'order') {
        filter.orderItems = document.orderItems;
        set.orderItems = normalized.orderItems.map(({price, ...item}) => item);
    }
    return { status: 'migratable', id: String(document._id), update: { $set: set, $unset: unset }, filter };
}
async function migrateMoney(connection, { apply = false, confirmDatabase, write = console.log } = {}) {
    if (apply && confirmDatabase !== connection.name) throw new Error('Confirme explicitamente o nome do banco alvo antes de aplicar.');
    write('Modo: ' + (apply ? 'APPLY' : 'DRY RUN'));
    write('Database: ' + connection.name);
    const summary = {}, plans = [];
    // Scan completo e resumo antes da primeira escrita. Não registrar conteúdo dos documentos.
    for (const [collection, kind] of [['products','product'],['orders','order']]) {
        const counters = { scanned: 0, migratable: 0, alreadyMigrated: 0, blocked: 0, modified: 0, concurrentChanges: 0 };
        for await (const document of connection.collection(collection).find({})) {
            counters.scanned++;
            const entry = inspectMoneyDocument(kind, document);
            counters[entry.status]++;
            if (entry.status === 'blocked') write(JSON.stringify({ collection, id: entry.id, field: entry.field, reason: entry.reason }));
            if (entry.status === 'migratable') plans.push({ collection, entry });
        }
        summary[collection] = counters;
        write(JSON.stringify({ collection, ...counters }));
    }
    if (apply) for (const { collection, entry } of plans) {
        const result = await connection.collection(collection).updateOne(entry.filter, entry.update);
        summary[collection].modified += result.modifiedCount;
        if (!result.matchedCount) summary[collection].concurrentChanges++;
    }
    if (apply) write(JSON.stringify({ applied: summary }));
    return summary;
}
module.exports = { inspectMoneyDocument, migrateMoney };
