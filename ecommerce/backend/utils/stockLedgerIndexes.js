// Explicit deployment operation. Does not rewrite products or movements.
async function upgradeStockLedgerIndex(connection) {
    const rows = connection.collection('stockmovements');
    // Establish the reserve constraint BEFORE removing its older broader constraint.
    await rows.createIndex({ order: 1, product: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'RESERVE' }, name: 'one_order_product_reserve' });
    const indexes = await rows.listIndexes().toArray();
    if (indexes.some(i => i.name === 'one_order_product_movement')) await rows.dropIndex('one_order_product_movement');
    await rows.createIndex({ product: 1 });
}
module.exports = { upgradeStockLedgerIndex };
