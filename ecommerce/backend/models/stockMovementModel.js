const mongoose = require('mongoose');
const { validStock } = require('../utils/inventory');
const integer = { type: Number, required: true, cast: require('../utils/inventory').validateStock, validate: validStock };
const schema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: function () { return ['RESERVE', 'RELEASE'].includes(this.type); } },
    type: { type: String, enum: ['RESERVE', 'INITIAL_STOCK', 'ADMIN_ADJUSTMENT', 'RELEASE'], required: true },
    quantity: { ...integer, required: function () { return ['RESERVE', 'RELEASE'].includes(this.type); }, min: 1 }, stockBefore: integer, stockAfter: integer,
    delta: { type: Number, cast: value => { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Delta inválido.'); return value; }, required: function () { return this.type !== 'RESERVE'; } },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: function () { return this.type !== 'RESERVE'; } },
    reason: { type: String, enum: ['PRODUCT_INITIAL_STOCK', 'ADMIN_PRODUCT_STOCK_UPDATE', 'ORDER_CANCELLED'], required: function () { return this.type !== 'RESERVE'; } },
    version: { type: Number, enum: [1], required: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
}, { collection: 'stockmovements' });
schema.index({ order: 1, product: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'RESERVE' }, name: 'one_order_product_reserve' });
schema.index({ product: 1 });
schema.pre('validate', function () {
    if (!require('../utils/stockMovementContract').validMovement(this)) throw new Error('Movimento de estoque incoerente.');
});
module.exports = mongoose.model('StockMovement', schema);
