const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  paymentStatus: { type: String, enum: ['PENDING', 'PAID'] },
  administrativeArchivedAt: { type: Date, default: null, select: false },
  administrativeArchivedBy: { type: mongoose.Schema.ObjectId, ref: 'User', default: null, select: false },
  idempotencyKeyHash: { type: String, match: /^[0-9a-f]{64}$/, select: false, immutable: true },
  idempotencyRequestHash: { type: String, match: /^[0-9a-f]{64}$/, select: false, immutable: true },
  inventoryStatus: { type: String, enum: ['RESERVED', 'RELEASED'] },
  cancelledAt: Date,
  cancelledByUserId: { type: mongoose.Schema.ObjectId, ref: 'User', select: false },
  cancellationSource: { type: String, enum: ['CUSTOMER', 'ADMIN'] },
  cancellationReasonCode: { type: String, enum: ['CUSTOMER_REQUEST', 'ADMIN_REQUEST'] },
  inventoryVersion: { type: Number, enum: [1], immutable: true },
  inventoryReservedAt: { type: Date, immutable: true },
  shippingInfoVersion: { type: Number, enum: [1, 2] },
  shippingInfo: require('../utils/shippingSchema')(true),
  orderItems: [
    {
      name: {
        type: String,
        required: true,
      },
      price: Number,
      priceCents: require('../utils/money').centsSchema(),
      quantity: {
        type: Number,
        required: true,
      },
      image: {
        type: String,
        required: true,
      },
      product: {
        type: mongoose.Schema.ObjectId,
        ref: "Product",
        required: true,
      },
    },
  ],
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  paymentInfo: {
    id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  paidAt: {
    type: Date,
  },
  itemsPrice: Number,
  taxPrice: Number,
  shippingPrice: Number,
  totalPrice: Number,
  itemsPriceCents: require('../utils/money').centsSchema(),
  taxPriceCents: require('../utils/money').centsSchema(),
  shippingPriceCents: require('../utils/money').centsSchema(),
  totalPriceCents: require('../utils/money').centsSchema(),
  orderStatus: {
    type: String,
    enum: ["Processing", "Shipped", "Delivered", "Cancelled"],
    required: true,
    default: "Processing",
  },
  deliveredAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { optimisticConcurrency: true });

orderSchema.index({ user: 1, idempotencyKeyHash: 1 }, { unique: true, name: 'one_order_per_key', partialFilterExpression: { idempotencyKeyHash: { $type: 'string' } } });
require('../utils/queryIndexes').add(orderSchema, 'orders');

orderSchema.pre('validate', function () {
  if (this.inventoryStatus === 'RELEASED' && this.orderStatus !== 'Cancelled') this.invalidate('inventoryStatus', 'Liberação exige cancelamento.');
  if (this.orderStatus === 'Cancelled' && (this.inventoryStatus !== 'RELEASED' || !this.cancelledAt || !this.cancelledByUserId ||
      !this.cancellationSource || !this.cancellationReasonCode || this.paymentStatus !== 'PENDING' || this.paidAt != null || this.deliveredAt != null))
    this.invalidate('orderStatus', 'Cancelamento inconsistente.');
  if (this.shippingInfoVersion === 2) {
    this.shippingInfo = require('../../shared/shippingAddress.mjs').normalizeShippingAddress(this.shippingInfo);
  }
  const { orderMoney, orderFields, MoneyError } = require('../utils/money');
  if (Object.keys(this.$errors || {}).some(path => path.endsWith('Cents')) || this.orderItems.some(item => item.$errors?.priceCents)) throw new MoneyError();
  const normalized = orderMoney(this.toObject());
  for (const field of orderFields) { this[field+'Cents'] = normalized[field+'Cents']; this[field] = undefined; }
  this.orderItems.forEach((item, index) => { item.priceCents = normalized.orderItems[index].priceCents; item.price = undefined; });
});
orderSchema.set('toJSON', { transform: (_doc, ret) => {
  delete ret.administrativeArchivedAt; delete ret.administrativeArchivedBy;
  delete ret.idempotencyKeyHash; delete ret.idempotencyRequestHash;
  delete ret.cancelledByUserId;
  return require('../utils/money').presentOrder(ret);
} });
function forbidPhysicalDelete() {
  const error = new Error('Pedidos não podem ser excluídos fisicamente.');
  error.code = 'ORDER_PHYSICAL_DELETE_FORBIDDEN';
  error.statusCode = 405;
  throw error;
}
for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) orderSchema.pre(operation, forbidPhysicalDelete);
orderSchema.pre('deleteOne', { document: true, query: false }, forbidPhysicalDelete);
orderSchema.pre('bulkWrite', function (operations) {
  if (operations.some(operation => operation.deleteOne || operation.deleteMany)) forbidPhysicalDelete();
});
const Order = mongoose.model('Order', orderSchema);
// Also protect collection calls and bulkWrite with skipMiddleware; native database
// maintenance remains outside the commercial model and requires separate authority.
for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) Order.collection[operation] = async () => forbidPhysicalDelete();
const bulkWrite = Order.collection.bulkWrite.bind(Order.collection);
Order.collection.bulkWrite = async (operations, ...options) => {
  if (operations.some(operation => operation.deleteOne || operation.deleteMany)) forbidPhysicalDelete();
  return bulkWrite(operations, ...options);
};
module.exports = Order;
