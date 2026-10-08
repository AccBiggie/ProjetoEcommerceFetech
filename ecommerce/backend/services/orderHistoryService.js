const Order = require('../models/orderModel');
const ErrorHander = require('../utils/errorHander');
const fields = '+administrativeArchivedAt +administrativeArchivedBy';
function sourceOrder(order) {
  if (order.toObject) return order.toObject();
  // Preserve existing casting of legacy shipping/money fields for presentation,
  // but never turn a stored string timestamp into trusted payment evidence.
  const result = Order.hydrate(order).toObject();
  result.paidAt = order.paidAt;
  result.user = order.user;
  return result;
}
function customerOrder(order) {
  const result = sourceOrder(order);
  delete result.idempotencyKeyHash; delete result.idempotencyRequestHash;
  delete result.administrativeArchivedAt; delete result.administrativeArchivedBy;
  return require('../utils/money').presentOrder(result);
}
function adminOrder(order) {
  const result = sourceOrder(order);
  delete result.idempotencyKeyHash; delete result.idempotencyRequestHash;
  result.administrativeArchivedAt ??= null;
  result.administrativeArchivedBy ??= null;
  return require('../utils/money').presentOrder(result);
}
function archiveFilter(value = 'active') {
  if (typeof value !== 'string' || !['active', 'archived', 'all'].includes(value)) throw new ErrorHander('Filtro de arquivamento inválido.', 400);
  return value === 'all' ? {} : { administrativeArchivedAt: value === 'active' ? null : { $ne: null } };
}
async function setArchived(id, actor, archived) {
  const order = await Order.findOneAndUpdate({ _id: id, administrativeArchivedAt: archived ? null : { $ne: null } },
    { $set: { administrativeArchivedAt: archived ? new Date() : null, administrativeArchivedBy: archived ? actor : null } },
    { returnDocument: 'after', runValidators: true }).select(fields).lean();
  const result = order || await Order.findById(id).select(fields).lean();
  if (!result) throw new ErrorHander('Pedido não encontrado.', 404);
  return adminOrder(result);
}
module.exports = { fields, adminOrder, customerOrder, archiveFilter, setArchived };
