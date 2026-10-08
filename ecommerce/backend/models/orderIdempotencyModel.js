const mongoose = require('mongoose');
const { ORDER_OPERATION } = require('../../shared/orderIntent.mjs');
const hash = { type: String, required: true, match: /^[0-9a-f]{64}$/ };
const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    operation: { type: String, enum: [ORDER_OPERATION], required: true },
    keyHash: hash,
    requestHash: hash,
    status: { type: String, enum: ['PROCESSING', 'COMPLETED', 'FAILED'], required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    failureCode: { type: String, enum: ['ORDER_CREATE_FAILED'] },
}, { timestamps: true });
schema.index({ user: 1, operation: 1, keyHash: 1 }, { unique: true, name: 'one_order_intent' });
module.exports = mongoose.model('OrderIdempotency', schema);
