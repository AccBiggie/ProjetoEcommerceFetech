const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  shippingInfo: {
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },

    state: {
      type: String,
      required: true,
    },

    country: {
      type: String,
      required: true,
    },
    pinCode: {
      type: Number,
      required: true,
    },
    phoneNo: {
      type: Number,
      required: true,
    },
  },
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
    enum: ["Processing", "Shipped", "Delivered"],
    required: true,
    default: "Processing",
  },
  deliveredAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { optimisticConcurrency: true });

orderSchema.pre('validate', function () {
  const { orderMoney, orderFields, MoneyError } = require('../utils/money');
  if (Object.keys(this.$errors || {}).some(path => path.endsWith('Cents')) || this.orderItems.some(item => item.$errors?.priceCents)) throw new MoneyError();
  const normalized = orderMoney(this.toObject());
  for (const field of orderFields) { this[field+'Cents'] = normalized[field+'Cents']; this[field] = undefined; }
  this.orderItems.forEach((item, index) => { item.priceCents = normalized.orderItems[index].priceCents; item.price = undefined; });
});
orderSchema.set('toJSON', { transform: (_doc, ret) => require('../utils/money').presentOrder(ret) });
module.exports = mongoose.model("Order", orderSchema);
