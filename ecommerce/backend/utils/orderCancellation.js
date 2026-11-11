const date = value => value instanceof Date && Number.isFinite(value.getTime());
// Canonical raw BSON state only. List eligibility is advisory; ledger is verified in the transaction.
function cancellationEligibility(order) {
  const blocked = blockedReason => ({ canCancel: false, blockedReason });
  if (['Shipped', 'Delivered'].includes(order.orderStatus) || order.shippedAt != null || order.deliveredAt != null) return blocked('ORDER_RETURN_REQUIRED');
  if (order.paymentStatus === 'PAID' || date(order.paidAt)) return blocked('ORDER_REFUND_REQUIRED');
  if (order.paymentStatus !== 'PENDING' || order.paidAt != null) return blocked('ORDER_PAYMENT_UNVERIFIED');
  if (order.orderStatus === 'Cancelled') return blocked(order.inventoryStatus === 'RELEASED' && date(order.cancelledAt) ? 'ORDER_ALREADY_CANCELLED' : 'ORDER_INVENTORY_UNVERIFIED');
  if (order.orderStatus !== 'Processing' || order.cancelledAt != null) return blocked('ORDER_NOT_CANCELLABLE');
  if (order.inventoryStatus !== 'RESERVED' || order.inventoryVersion !== 1 || !date(order.inventoryReservedAt)) return blocked('ORDER_INVENTORY_UNVERIFIED');
  return { canCancel: true, blockedReason: null };
}
const messages = Object.freeze({
  ORDER_REFUND_REQUIRED: 'Este pedido possui pagamento confirmado e não pode ser cancelado automaticamente por este fluxo.',
  ORDER_RETURN_REQUIRED: 'Este pedido já avançou para envio ou entrega e não pode ser cancelado por este fluxo.',
  ORDER_PAYMENT_UNVERIFIED: 'O estado de pagamento deste pedido precisa de revisão antes do cancelamento.',
  ORDER_INVENTORY_UNVERIFIED: 'A reserva de estoque deste pedido precisa de revisão antes do cancelamento.',
  ORDER_NOT_CANCELLABLE: 'O pedido foi alterado. Atualize a página antes de tentar cancelar.',
});
module.exports = { cancellationEligibility, messages, date };
