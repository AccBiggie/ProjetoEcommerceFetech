//Product Model
const mongoose = require('mongoose');
const productSchema = mongoose.Schema( {
    off: {
        type: Number,
        required: [true, "Por favor, insira uma promoção válida."],
        maxLength: [15, "A promoção não pode exceder mais que 15 caracteres."],
    },
    countDown: {
        type: String,
        required: [true, "Por favor, insira uma data para o contador."],
        maxLength: [50, "A data não pode exceder mais que 40 caracteres."],
    },
    name: {
        type: String,
        required: [true, "Please enter product name"],
        trim: true
    },
    description: {
        type: String,
        required: [true ,"Please enter product description"]
    },
    // Campos antigos somente para leitura/transição. Novas gravações removem decimais.
    price: String,
    oldPrice: String,
    installmmentPrice: String,
    priceCents: require('../utils/money').centsSchema(),
    oldPriceCents: { ...require('../utils/money').centsSchema(), required: false, set: value => value == null ? value : require('../utils/money').assertCents(value), validate: value => value == null || Number.isSafeInteger(value) && value >= 0 },
    installmmentPriceCents: require('../utils/money').centsSchema(),
    ratings: {
        type: Number,
        default: 0,
    },
    images: [
        {
            public_id: {
                type: String,
                required: true
            },
            url: {
                type: String,
                required: true
            },
            banner: {
                type:String,
                required: true
            },
        },
    ],
    category: {
        type: String,
        required: [true, "Please enter product category"],
    },
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
    },
    Stock: {
        type: Number,
        // $inc precisa aceitar deltas negativos; min valida valores do documento.
        cast: value => {
            if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Estoque deve ser inteiro seguro.');
            return value;
        },
        validate: { validator: Number.isSafeInteger, message: "Estoque deve ser inteiro." },
        min: [0, "Estoque não pode ser negativo."],
        required: [true, "Please enter product stock"],
        maxLength: [4, "Stock cannot exceed 4 characters"],
        default: 1
    },
    numOfReviews: {
        type: Number,
        default: 0,
    },
    stockLedgerVersion: { type: Number, enum: [1], immutable: true },
    reviews: [
        {
            user: {
                type: mongoose.Schema.ObjectId,
                ref: "User",
                required: true,
            },
            name: {
                type: String,
                required: true,
            },
            rating: {
                type: Number,
                required: true,
            },
            comment: {
                type: String,
                required: true,
            },
        },
    ],
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        require: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});
productSchema.pre('validate', function () {
    const { productFields, MoneyError } = require('../utils/money');
    if (Object.keys(this.$errors || {}).some(path => path.endsWith('Cents'))) throw new MoneyError();
    Object.assign(this, require('../utils/productDomain').commercial(this));
    for (const field of productFields) this[field] = undefined;
});
productSchema.set('toJSON', { transform: (_doc, ret) => require('../utils/money').presentProduct(ret) });
require('../utils/queryIndexes').add(productSchema, 'products');
module.exports = mongoose.model("Product", productSchema);




