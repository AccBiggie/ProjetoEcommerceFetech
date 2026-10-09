const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['USER_AVATAR'], default: 'USER_AVATAR' },
    provider: { type: String, enum: ['CLOUDINARY'], default: 'CLOUDINARY' },
    publicId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['PREPARED', 'UPLOADED', 'ATTACHED', 'CLEANING', 'CLEANED', 'FAILED'], default: 'PREPARED' },
    expectedAvatarRevision: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    failureCode: { type: String, default: null },
}, { timestamps: true, versionKey: false });
schema.index({ status: 1, updatedAt: 1 });
module.exports = mongoose.model('MediaUploadIntent', schema);
