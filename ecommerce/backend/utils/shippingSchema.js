const { shippingFields, normalizeShippingField } = require('../../shared/shippingAddress.mjs');

module.exports = (versioned = false) => Object.fromEntries(Object.entries(shippingFields).map(([field, rule]) => [field, {
    type: String,
    trim: true,
    required: function () { return !rule.optional && (!versioned || this.shippingInfoVersion === 2); },
    // Legados não recebem regex, novos campos obrigatórios ou preenchimento artificial.
    ...(versioned ? {} : { maxlength: rule.max, ...(rule.pattern ? { match: [rule.pattern, rule.message] } : {}), ...(rule.optional ? { default: '' } : {}) }),
    set: function (value) {
        if (!versioned || this.shippingInfoVersion === 2 || this.isNew) return normalizeShippingField(field, value);
        return value;
    },
}]));
