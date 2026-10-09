const mongoose = require("mongoose");

const requiredText = (label, maxlength) => ({
    type: String, required: [true, `Informe ${label}.`], trim: true, maxlength,
});
const addressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    label: requiredText("a identificação do endereço", 80),
    ...require('../utils/shippingSchema')(),
    country: { ...require('../utils/shippingSchema')().country, default: 'Brasil' },
    favorite: { type: Boolean, default: false },
}, { timestamps: true });

// A unicidade também vale para escritas concorrentes e outros processos.
addressSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { favorite: true }, name: "one_favorite_per_user" });
require('../utils/queryIndexes').add(addressSchema, 'addresses');

module.exports = mongoose.model("Address", addressSchema);
