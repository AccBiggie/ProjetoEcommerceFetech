const { readCents, formatCentsToDecimal } = require('./money');
const { presentPayment } = require('./orderPayment');
const fields = '_id user orderStatus paymentStatus paidAt createdAt deliveredAt shippedAt totalPrice totalPriceCents inventoryStatus inventoryVersion inventoryReservedAt cancelledAt cancellationSource cancellationReasonCode';
function summary(order, admin = false) {
    const result = presentPayment(order), totalPriceCents = readCents(order, 'totalPrice');
    if (admin) { result.administrativeArchivedAt ??= null; result.administrativeArchivedBy ??= null; }
    return { ...result, totalPriceCents, totalPrice: formatCentsToDecimal(totalPriceCents), moneyLegacy: order.totalPriceCents == null };
}
module.exports = { fields, summary };
