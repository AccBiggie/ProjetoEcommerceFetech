const Address = require("../models/addressModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const addressInput = require("../utils/addressInput");
const { withAddressWrite, saveAddress } = require("../utils/addressWrite");

async function ownAddress(req) {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
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
    const address = await withAddressWrite(req.user._id, () => saveAddress(new Address({ ...addressInput(req.body), user: req.user._id })));
    res.status(201).json({ success: true, address });
});
exports.updateAddress = catchAsyncErrors(async (req, res) => {
    const address = await withAddressWrite(req.user._id, async () => {
        const current = await ownAddress(req);
        Object.assign(current, addressInput(req.body));
        return saveAddress(current);
    });
    res.json({ success: true, address });
});
exports.deleteAddress = catchAsyncErrors(async (req, res) => {
    await withAddressWrite(req.user._id, async () => { await (await ownAddress(req)).deleteOne(); });
    res.json({ success: true, message: "Endereço excluído." });
});
exports.favoriteAddress = catchAsyncErrors(async (req, res) => {
    const address = await withAddressWrite(req.user._id, async () => {
        const current = await ownAddress(req);
        current.favorite = true;
        return saveAddress(current);
    });
    res.json({ success: true, address });
});
