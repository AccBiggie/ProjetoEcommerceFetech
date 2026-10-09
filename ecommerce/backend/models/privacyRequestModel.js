const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['ANONYMIZE_ACCOUNT'], default: 'ANONYMIZE_ACCOUNT', required: true },
    status: { type: String, enum: ['REQUESTED', 'COMPLETED', 'CANCELLED'], default: 'REQUESTED' },
    requestedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null }, cancelledAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestId: { type: String, required: true, match: require('../observability/logger').uuid },
}, { timestamps: true, strict: 'throw', versionKey: false });
schema.index({ user: 1, type: 1 }, { unique: true, partialFilterExpression: { status: 'REQUESTED' }, name: 'one_active_privacy_request' });
schema.index({ user: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.pre('validate', function () {
    if (this.status === 'COMPLETED' && (!this.completedAt || !this.processedBy || this.cancelledAt) || this.status === 'CANCELLED' && (!this.cancelledAt || this.completedAt || this.processedBy) || this.status === 'REQUESTED' && (this.completedAt || this.cancelledAt || this.processedBy)) throw new Error('Privacy request state inconsistent');
});
module.exports = mongoose.model('PrivacyRequest', schema);
