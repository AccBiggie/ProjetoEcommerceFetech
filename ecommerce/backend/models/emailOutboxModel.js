const mongoose = require('mongoose');
const { events, states, policy, codes } = require('../services/email/contract');
const schema = new mongoose.Schema({
    schemaVersion: { type: Number, enum: [1], default: 1 },
    eventType: { type: String, enum: events, required: true },
    dedupeKey: { type: String, required: true, match: /^(ACCOUNT_REGISTERED|ORDER_CREATED|ORDER_CANCELLED|ACCOUNT_DEACTIVATED|ACCOUNT_REACTIVATED|PRIVACY_REQUEST_CREATED):[a-f0-9]{24}:(v1|[0-9]+)$/ },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    entityType: { type: String, enum: ['USER', 'ORDER', 'PRIVACY_REQUEST'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: states, default: 'PENDING' },
    attempts: { type: Number, default: 0, min: 0, max: policy.maxAttempts, validate: Number.isSafeInteger },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseToken: { type: String, default: null, match: require('../observability/logger').uuid },
    leaseExpiresAt: { type: Date, default: null },
    lastErrorCode: { type: String, enum: [...codes, null], default: null },
    providerMessageId: { type: String, default: null, match: /^sha256:[a-f0-9]{64}$/ },
    requestId: { type: String, default: null, match: require('../observability/logger').uuid },
    sentAt: { type: Date, default: null }, suppressedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw', versionKey: false });
schema.index({ dedupeKey: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1, createdAt: 1, _id: 1 });
schema.index({ status: 1, leaseExpiresAt: 1 });
schema.pre('validate', function () {
    if (this.status === 'PROCESSING' ? !this.leaseToken || !this.leaseExpiresAt : this.leaseToken != null || this.leaseExpiresAt != null) this.invalidate('status', 'Inconsistent lease state');
    if (this.status === 'SENT' && !this.sentAt || this.status !== 'SENT' && this.sentAt || this.status === 'SUPPRESSED' && !this.suppressedAt || this.status !== 'SUPPRESSED' && this.suppressedAt) this.invalidate('status', 'Inconsistent terminal state');
});
module.exports = mongoose.model('EmailOutbox', schema);
