const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    scope: { type: String, required: true },
    count: { type: Number, required: true, min: 0 },
    pending: { type: Number, required: true, min: 0, default: 0 },
    windowStartedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
}, { collection: 'authratelimits', versionKey: false, bufferCommands: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('AuthRateLimit', schema);
