const { validStock } = require('./inventory');
function validMovement(m) {
    if (!validStock(m.stockBefore) || !validStock(m.stockAfter)) return false;
    if (m.type === 'RESERVE') return validStock(m.quantity) && m.quantity > 0 && m.stockBefore - m.quantity === m.stockAfter;
    if (m.type === 'RELEASE') return m.order != null && m.actorUserId != null && m.reason === 'ORDER_CANCELLED' && validStock(m.quantity) && m.quantity > 0 && m.delta === m.quantity && BigInt(m.stockBefore) + BigInt(m.quantity) === BigInt(m.stockAfter);
    if (!['ADMIN_ADJUSTMENT', 'INITIAL_STOCK'].includes(m.type) || !Number.isSafeInteger(m.delta) || m.delta === 0 || m.order != null || m.quantity != null || !m.actorUserId) return false;
    if (BigInt(m.stockBefore) + BigInt(m.delta) !== BigInt(m.stockAfter)) return false;
    return m.type === 'INITIAL_STOCK' ? m.stockBefore === 0 && m.delta > 0 && m.reason === 'PRODUCT_INITIAL_STOCK' : m.reason === 'ADMIN_PRODUCT_STOCK_UPDATE';
}
module.exports = { validMovement };
