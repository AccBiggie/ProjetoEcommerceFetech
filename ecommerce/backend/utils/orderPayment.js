function paymentConfirmed(order) {
    return order.paymentStatus === 'PAID' && order.paidAt instanceof Date && Number.isFinite(order.paidAt.getTime());
}
function presentPayment(order) {
    const confirmed = paymentConfirmed(order);
    const status = ['PENDING', 'PAID'].includes(order.paymentStatus) ? order.paymentStatus : 'UNVERIFIED';
    return { ...order, paymentStatus: status, paymentConfirmed: confirmed,
        // Legacy/browser/provider payload is not payment evidence or a public DTO.
        paymentInfo: { status: confirmed ? 'Paid' : status === 'PENDING' ? 'Pending' : 'Unverified' } };
}
module.exports = { paymentConfirmed, presentPayment };
