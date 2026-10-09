const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['USER_AVATAR'], default: 'USER_AVATAR' },
    provider: { type: String, enum: ['CLOUDINARY'], default: 'CLOUDINARY' },
    publicId: { type: String, required: true },
    reason: { type: String, enum: ['REPLACED_AVATAR', 'UNATTACHED_UPLOAD'], required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'BLOCKED'], default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    failureCode: { type: String, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ provider: 1, publicId: 1 }, { unique: true });
schema.index({ status: 1, updatedAt: 1 });
module.exports = mongoose.model('MediaCleanupTask', schema);
