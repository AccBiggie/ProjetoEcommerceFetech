const Order = require('../models/orderModel');
const { fields } = require('./orderHistoryService');
const { paymentConfirmed } = require('../utils/orderPayment');
const ErrorHander = require('../utils/errorHander');
const nextState = Object.freeze({ Processing: 'Shipped', Shipped: 'Delivered' });
function conflict(code, message) { const error = new ErrorHander(message, 409); error.code = code; return error; }
function checkTransition(order, target) {
    if (order.orderStatus === target) return false;
    if (nextState[order.orderStatus] !== target) throw conflict('ORDER_STATUS_TRANSITION_INVALID', 'Transição de status do pedido inválida.');
    if (!paymentConfirmed(order)) throw conflict('ORDER_PAYMENT_NOT_CONFIRMED', 'O pedido não pode avançar para envio ou entrega antes da confirmação do pagamento.');
    return true;
}
async function transitionOrder(id, target) {
    if (typeof target !== 'string' || !['Processing', 'Shipped', 'Delivered'].includes(target)) throw new ErrorHander('Status do pedido inválido.', 400);
    const read = () => Order.findById(id).select(fields).lean();
    const initial = await read();
    if (!initial) throw new ErrorHander('Pedido não encontrado.', 404);
    if (!checkTransition(initial, target)) return initial;
    const updated = await Order.findOneAndUpdate({ _id: id, orderStatus: initial.orderStatus, paymentStatus: 'PAID',
        paidAt: { $eq: initial.paidAt, $type: 'date' } },
        { $set: { orderStatus: target, ...(target === 'Delivered' ? { deliveredAt: new Date() } : {}) } },
        { returnDocument: 'after', runValidators: true }).select(fields).lean();
    if (updated) return updated;
    const current = await read();
    if (!current) throw new ErrorHander('Pedido não encontrado.', 404);
    if (current.orderStatus === target) return current;
    if (!paymentConfirmed(current)) throw conflict('ORDER_PAYMENT_NOT_CONFIRMED', 'O pedido não pode avançar para envio ou entrega antes da confirmação do pagamento.');
    // Never retry against a different state: the original intent was checked once.
    throw conflict('ORDER_STATUS_TRANSITION_INVALID', 'O pedido foi alterado. Atualize a página e tente novamente.');
}
module.exports = { transitionOrder, checkTransition };
