const Address = require("../models/addressModel");
const ErrorHander = require("./errorHander");

const userWrites = new Map();

// Serializa alterações de uma mesma conta no servidor local sem exigir replica set.
// O índice parcial do MongoDB garante no máximo um favorito entre processos.
async function withAddressWrite(userId, work) {
    const key = String(userId);
    const previous = userWrites.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    userWrites.set(key, current);
    try { return await current; }
    finally { if (userWrites.get(key) === current) userWrites.delete(key); }
}

async function saveAddress(address) {
    // Valida antes de remover o favorito anterior: entrada inválida não muda a conta.
    await address.validate();
    if (!address.favorite) return address.save();
    const previous = await Address.findOne({ user: address.user, favorite: true, _id: { $ne: address._id } });
    await Address.updateMany({ user: address.user, favorite: true, _id: { $ne: address._id } }, { $set: { favorite: false } });
    try { return await address.save(); }
    catch (error) {
        if (previous && !await Address.exists({ user: address.user, favorite: true })) {
            // Em outro processo pode haver um novo favorito; o índice protege o vínculo.
            await Address.updateOne({ _id: previous._id, user: address.user }, { $set: { favorite: true } }).catch(() => {});
        }
        if (error.code === 11000) throw new ErrorHander("O favorito foi alterado em outra sessão. Atualize a página e tente novamente.", 409);
        throw error;
    }
}

module.exports = { withAddressWrite, saveAddress };
