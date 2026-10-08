const Order = require('../models/orderModel');
const ErrorHander = require('../utils/errorHander');
const fields = '+administrativeArchivedAt +administrativeArchivedBy';
function adminOrder(order) {
  const result = order.toObject ? order.toObject() : { ...order };
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
    { returnDocument: 'after', runValidators: true }).select(fields);
  const result = order || await Order.findById(id).select(fields);
  if (!result) throw new ErrorHander('Pedido não encontrado.', 404);
  return adminOrder(result);
}
module.exports = { fields, adminOrder, archiveFilter, setArchived };
