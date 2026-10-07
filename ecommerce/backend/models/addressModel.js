const mongoose = require("mongoose");

const requiredText = (label, maxlength) => ({
    type: String, required: [true, `Informe ${label}.`], trim: true, maxlength,
});
const addressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    label: requiredText("a identificação do endereço", 80),
    recipientName: requiredText("o nome do destinatário", 120),
    address: requiredText("o endereço", 200),
    number: requiredText("o número", 30),
    complement: { type: String, trim: true, maxlength: 120, default: "" },
    neighborhood: requiredText("o bairro", 120),
    city: requiredText("a cidade", 120),
    state: requiredText("o estado", 80),
    country: { ...requiredText("o país", 80), default: "Brasil" },
    pinCode: {
        ...requiredText("o CEP", 8),
        match: [/^\d{8}$/, "Informe um CEP com 8 dígitos."],
    },
    phoneNo: {
        ...requiredText("o telefone", 15),
        match: [/^\d{10,15}$/, "Informe um telefone com 10 a 15 dígitos, incluindo DDD."],
    },
    favorite: { type: Boolean, default: false },
}, { timestamps: true });

// A unicidade também vale para escritas concorrentes e outros processos.
addressSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { favorite: true }, name: "one_favorite_per_user" });
addressSchema.index({ user: 1, favorite: -1, createdAt: -1 });

module.exports = mongoose.model("Address", addressSchema);
