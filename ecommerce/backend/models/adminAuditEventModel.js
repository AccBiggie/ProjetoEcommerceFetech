const mongoose = require('mongoose');
const { actions, metadataFor } = require('../observability/auditContract');
const { uuid } = require('../observability/logger');
const schema = new mongoose.Schema({
    eventVersion: { type: Number, required: true, enum: [1] },
    createdAt: { type: Date, required: true, immutable: true },
    requestId: { type: String, required: true, match: uuid },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorRole: { type: String, required: true, enum: ['admin'] },
    action: { type: String, required: true, enum: Object.keys(actions) },
    targetType: { type: String, required: true, enum: ['ORDER','USER','PRODUCT','CATEGORY'] },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, required: true, default: () => ({}) },
}, { collection: 'adminauditevents', versionKey: false, strict: 'throw', minimize: false });
const immutable = () => { throw new Error('Administrative audit events are append-only'); };
schema.pre('validate', function () {
    if (!this.isNew) immutable();
    if (actions[this.action]?.[0] !== this.targetType) throw new Error('Invalid audit target');
    this.metadata = metadataFor(this.action, this.metadata);
});
schema.pre('save', function () { if (!this.isNew) immutable(); });
for (const method of ['updateOne','updateMany','findOneAndUpdate','replaceOne','deleteOne','deleteMany','findOneAndDelete','findOneAndReplace','bulkWrite']) schema.pre(method, immutable);
schema.pre('deleteOne', { document: true, query: false }, immutable);
schema.pre('aggregate', function () { if (this.pipeline().some(stage => stage.$out || stage.$merge)) immutable(); });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ action: 1, createdAt: -1, _id: -1 });
schema.index({ targetType: 1, targetId: 1, createdAt: -1, _id: -1 });
schema.index({ actorUserId: 1, createdAt: -1, _id: -1 });
require('../utils/queryIndexes').add(schema, 'adminauditevents');
const Model = mongoose.model('AdminAuditEvent', schema);
// Bulk APIs can disable middleware; reject them before that option is considered.
for (const method of ['bulkWrite','bulkSave']) Model[method] = async () => immutable();
module.exports = Model;
