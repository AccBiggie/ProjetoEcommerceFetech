const money = require('../../shared/money.mjs');
const productFields = ['price', 'oldPrice', 'installmmentPrice'];
const orderFields = ['itemsPrice', 'taxPrice', 'shippingPrice', 'totalPrice'];
function productMoney(record) {
    return Object.fromEntries(productFields.map(field => [field + 'Cents', money.readCents(record, field)]));
}
function orderMoney(record) {
    if (!Array.isArray(record.orderItems) || !record.orderItems.length) throw new money.MoneyError("missing");
    const orderItems = record.orderItems.map(item => ({ ...item, priceCents: money.readCents(item, 'price') }));
    const totals = Object.fromEntries(orderFields.map(field => [field + 'Cents', money.readCents(record, field)]));
    const lines = money.sumCents(orderItems.map(item => money.multiplyCents(item.priceCents, item.quantity)));
    if (lines !== totals.itemsPriceCents || money.sumCents([lines, totals.taxPriceCents, totals.shippingPriceCents]) !== totals.totalPriceCents) throw new money.MoneyError('inconsistent');
    return { orderItems, ...totals };
}
function presentProduct(record) {
    const cents = productMoney(record);
    return { ...record, ...cents, ...Object.fromEntries(productFields.map(f => [f, money.formatCentsToDecimal(cents[f+'Cents'])])), moneyLegacy: productFields.some(f => record[f+'Cents'] == null) };
}
function presentOrder(record) {
    const cents = orderMoney(record);
    return { ...record, ...cents,
        orderItems: cents.orderItems.map(item => ({...item, price: money.formatCentsToDecimal(item.priceCents)})),
        ...Object.fromEntries(orderFields.map(f => [f, money.formatCentsToDecimal(cents[f+'Cents'])])),
        moneyLegacy: orderFields.some(f => record[f+'Cents'] == null) || record.orderItems.some(item => item.priceCents == null) };
}
const centsSchema = () => ({ type: Number, required: true, set: value => value === undefined ? value : money.assertCents(value), validate: { validator: value => Number.isSafeInteger(value) && value >= 0, message: 'Centavos devem ser inteiros não negativos dentro do limite seguro.' } });
module.exports = { ...money, productFields, orderFields, productMoney, orderMoney, presentProduct, presentOrder, centsSchema };
