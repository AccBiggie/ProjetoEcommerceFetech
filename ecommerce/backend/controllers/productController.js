const Product = require("../models/productModel");
const { runAuditedAdminMutation } = require('../services/adminAuditService');
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ApiFeatures = require("../utils/apiFeatures");
const Category = require("../models/categoryModel");
const { categoryKey, resolveProductCategory } = require("../utils/categories");
const productFields = ["name", "description", "category", "price", "oldPrice", "installmmentPrice", "off", "countDown", "Stock", "images"];
const { productMoney, productFields: moneyFields, parseMoneyToCents } = require('../utils/money');
const productInput = body => {
    if (body.Stock !== undefined) require('../utils/inventory').validateStock(body.Stock);
    const result = Object.fromEntries(productFields.filter(key => body[key] !== undefined && !moneyFields.includes(key)).map(key => [key, body[key]]));
    for (const field of moneyFields) if (body[field] !== undefined) result[field+'Cents'] = parseMoneyToCents(body[field]);
    return result;
};
exports.createProduct = catchAsyncErrors(async (req, res) => {
    const product = await runAuditedAdminMutation(req, async session => {
        const [value] = await Product.create([{ ...productInput(req.body), ...await resolveProductCategory(req.body, session), user: req.user._id }], { session });
        return { value, event: { action: 'PRODUCT_CREATED', targetId: value._id } };
    });
    res.status(201).json({ success: true, product });
});
exports.getAllProducts = catchAsyncErrors(async (req, res) => {
    const resultPerPage = 12;
    const feature = new ApiFeatures(Product.find(), { ...req.query, category: undefined }).search().filter();
    if (typeof req.query.category === "string" && req.query.category) {
        const categories = await Category.find().lean();
        const selected = categories.find(category => String(category._id) === req.query.category || categoryKey(category.name) === categoryKey(req.query.category));
        if (selected) {
            const ids = new Set([String(selected._id)]);
            let previousSize;
            do {
                previousSize = ids.size;
                for (const category of categories) if (ids.has(String(category.parent_id))) ids.add(String(category._id));
            } while (previousSize !== ids.size);
            feature.query = feature.query.find({ category_id: { $in: [...ids] } });
        } else feature.query = feature.query.find({ category: req.query.category });
    }
    const filteredProductsCount = await Product.countDocuments(feature.query.getFilter());
    const productsCount = await Product.countDocuments();
    const products = await feature.pagination(resultPerPage).query;
    res.json({ success: true, products, productsCount, filteredProductsCount, resultPerPage });
});
exports.getAdminProducts = catchAsyncErrors(async (req, res) => {
    res.json({ success: true, products: await Product.find().sort({ createdAt: -1 }) });
});
exports.getProductDetails = catchAsyncErrors(async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    res.json({ success: true, product });
});
exports.updateProduct = catchAsyncErrors(async (req, res, next) => {
    const product = await runAuditedAdminMutation(req, async session => {
        const existing = await Product.findById(req.params.id).session(session);
        if (!existing) throw new ErrorHander('Produto não encontrado.', 404);
        const value = await Product.findByIdAndUpdate(req.params.id, { $set: { ...productMoney({ ...existing.toObject(), ...productInput(req.body) }), ...productInput(req.body), ...await resolveProductCategory(req.body, session) }, $unset: Object.fromEntries(moneyFields.map(field => [field, 1])) }, { returnDocument: 'after', runValidators: true, session });
        if (!value) throw new ErrorHander('Produto não encontrado.', 404);
        const changedFields = [...productFields.filter(key => !moneyFields.includes(key)), 'category_id', ...moneyFields.map(field => field + 'Cents')].filter(key => JSON.stringify(existing[key]) !== JSON.stringify(value[key]));
        return { value, event: { action: 'PRODUCT_UPDATED', targetId: value._id, metadata: { changedFields } } };
    });
    res.json({ success: true, product });
});
exports.deleteProduct = catchAsyncErrors(async (req, res, next) => {
    await runAuditedAdminMutation(req, async session => {
        const product = await Product.findByIdAndDelete(req.params.id, { session });
        if (!product) throw new ErrorHander('Produto não encontrado.', 404);
        return { event: { action: 'PRODUCT_DELETED', targetId: product._id } };
    });
    res.json({ success: true, message: "Produto removido." });
});
const reviews = require('../services/productReviewService');
const { objectId } = require('../utils/reviewContract');
exports.createProductReview = catchAsyncErrors(async (req, res) => {
    const product = await reviews.upsert({ productId: req.body?.productId, user: req.user, body: req.body });
    res.json({ success: true, product });
});
exports.getProductReviews = catchAsyncErrors(async (req, res) => {
    const product = await Product.findById(objectId(req.query.productId || req.query.id));
    if (!product) throw new ErrorHander('Produto não encontrado.', 404);
    res.json({ success: true, reviews: product.reviews });
});
exports.deleteReview = catchAsyncErrors(async (req, res) => {
    // Validate before entering the administrative transaction.
    const productId = objectId(req.query.productId), reviewId = objectId(req.query.id);
    const mutate = async session => {
        const value = await reviews.remove({ productId, reviewId, user: req.user, session });
        return { value, event: { action: 'PRODUCT_REVIEW_DELETED', targetId: value._id, metadata: { reviewId: String(reviewId) } } };
    };
    const product = req.user.role === 'admin' ? await runAuditedAdminMutation(req, mutate) : (await mutate()).value;
    res.json({ success: true, product });
});
