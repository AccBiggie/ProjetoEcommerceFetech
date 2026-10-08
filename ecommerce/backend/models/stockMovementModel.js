const mongoose = require('mongoose');
const { validStock } = require('../utils/inventory');
const integer = { type: Number, required: true, cast: require('../utils/inventory').validateStock, validate: validStock };
const schema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    type: { type: String, enum: ['RESERVE'], required: true },
    quantity: { ...integer, min: 1 }, stockBefore: integer, stockAfter: integer,
    version: { type: Number, enum: [1], required: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
}, { collection: 'stockmovements' });
schema.index({ order: 1, product: 1, type: 1 }, { unique: true, name: 'one_order_product_movement' });
schema.pre('validate', function () {
    if (this.stockBefore - this.quantity !== this.stockAfter) throw new Error('Movimento de reserva incoerente.');
});
module.exports = mongoose.model('StockMovement', schema);
