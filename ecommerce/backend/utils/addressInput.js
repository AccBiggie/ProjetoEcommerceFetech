const ErrorHander = require("./errorHander");

const { normalizeShippingField } = require('../../shared/shippingAddress.mjs');

const fields = ["label", "recipientName", "address", "number", "complement", "neighborhood", "city", "state", "country", "pinCode", "phoneNo"];

module.exports = (body = {}) => {
    const input = {};
    for (const field of fields) {
        if (body[field] === undefined) continue;
        if (typeof body[field] !== "string") throw new ErrorHander("Os campos do endereço devem ser informados como texto.", 400);
        const value = body[field].trim();
        if (field === "pinCode" || field === "phoneNo") {
            const allowed = field === "pinCode" ? /^[\d\s-]*$/ : /^[\d\s()+.-]*$/;
            if (!allowed.test(value)) throw new ErrorHander(field === "pinCode" ? "CEP inválido." : "Telefone inválido.", 400);
            input[field] = value.replace(/\D/g, "");
        } else input[field] = value;
    }
    for (const field of fields.filter(field => field !== 'label')) {
        if (input[field] !== undefined) input[field] = normalizeShippingField(field, input[field]);
    }
    if (body.favorite !== undefined) {
        if (typeof body.favorite !== "boolean") throw new ErrorHander("O favorito deve ser informado como verdadeiro ou falso.", 400);
        input.favorite = body.favorite;
    }
    return input;
};
