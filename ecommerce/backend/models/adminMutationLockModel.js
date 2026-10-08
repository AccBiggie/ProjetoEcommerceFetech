const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    _id: String,
    owner: { type: String, default: null },
    lockedUntil: Date,
    fence: { type: Number, default: 0 },
    bootstrapUserId: mongoose.Schema.Types.ObjectId,
    createdAt: Date,
    updatedAt: Date,
}, { collection: 'adminmutationlocks', versionKey: false, bufferCommands: false });
// Singleton persistente: não aplicar TTL, pois a geração não pode voltar a zero.
module.exports = mongoose.model('AdminMutationLock', schema);
