const Address = require("../models/addressModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const addressInput = require("../utils/addressInput");
const { withAddressWrite, saveAddress } = require("../utils/addressWrite");
const { withPrivacySensitiveWrite } = require('../services/privacySensitiveWrite');
const write = (req, fn) => withAddressWrite(req.user._id, () => withPrivacySensitiveWrite(req.user, fn));

async function ownAddress(req, session) {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id }).session(session || null);
    if (!address) throw new ErrorHander("Endereço não encontrado.", 404);
    return address;
}

exports.getAddresses = catchAsyncErrors(async (req, res) => {
    const paging = require('../utils/pagination');
    paging.queryContract(req, []);
    const addresses = await paging.reference(Address, { user: req.user._id }, { favorite: -1, createdAt: -1, _id: -1 }, 100, '-__v');
    res.json({ success: true, addresses });
});
exports.getAddress = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, address: await ownAddress(req) });
});
exports.createAddress = catchAsyncErrors(async (req, res) => {
    const address = await write(req, session => saveAddress(new Address({ ...addressInput(req.body), user: req.user._id }), { session }));
    res.status(201).json({ success: true, address });
});
exports.updateAddress = catchAsyncErrors(async (req, res) => {
    const address = await write(req, async session => {
        const current = await ownAddress(req, session);
        Object.assign(current, addressInput(req.body));
        return saveAddress(current, { session });
    });
    res.json({ success: true, address });
});
exports.deleteAddress = catchAsyncErrors(async (req, res) => {
    await write(req, async session => { await (await ownAddress(req, session)).deleteOne({ session }); });
    res.json({ success: true, message: "Endereço excluído." });
});
exports.favoriteAddress = catchAsyncErrors(async (req, res) => {
    const address = await write(req, async session => {
        const current = await ownAddress(req, session);
        current.favorite = true;
        return saveAddress(current, { session });
    });
    res.json({ success: true, address });
});
