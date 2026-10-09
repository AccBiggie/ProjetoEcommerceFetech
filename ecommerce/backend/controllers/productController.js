const Product = require("../models/productModel");
const { runAuditedAdminMutation } = require('../services/adminAuditService');
const { runHierarchyAdminMutation, validateBody } = require('../services/categoryHierarchyService');
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const paging = require('../utils/pagination');
const { productFilter, productProjection } = require('../utils/listQueries');
const { presentProduct } = require('../utils/money');
const mutations = require('../services/productMutationService');
const domain = require('../utils/productDomain');
exports.createProduct = catchAsyncErrors(async (req, res) => {
    validateBody(req.body);
    domain.input(req.body);
    await mutations.prepareStockLedger();
    const product = await runHierarchyAdminMutation(req, async session => {
        const value = await mutations.create(req.body, req.user._id, session);
        return { value, event: { action: 'PRODUCT_CREATED', targetId: value._id } };
    });
    res.status(201).json({ success: true, product });
});
exports.getAllProducts = catchAsyncErrors(async (req, res) => {
    const pagination = paging.parsePagination(req.query, 12);
    const { filter, query } = await productFilter(req, Product);
    const [result, productsCount] = await Promise.all([
        paging.collection(Product, filter, pagination, productProjection, paging.sort(query)), Product.countDocuments(),
    ]);
    res.json({ success: true, products: result.items.map(presentProduct), pagination: result.pagination,
        productsCount, filteredProductsCount: result.pagination.total, resultPerPage: pagination.limit });
});
exports.getAdminProducts = catchAsyncErrors(async (req, res) => {
    const pagination = paging.parsePagination(req.query);
    const { filter, query } = await productFilter(req, Product);
    const result = await paging.collection(Product, filter, pagination, productProjection, paging.sort(query));
    res.json({ success: true, products: result.items.map(presentProduct), pagination: result.pagination });
});
exports.getProductDetails = catchAsyncErrors(async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    res.json({ success: true, product });
});
exports.updateProduct = catchAsyncErrors(async (req, res, next) => {
    validateBody(req.body);
    domain.input(req.body);
    if (Object.hasOwn(req.body, 'Stock')) await mutations.prepareStockLedger();
    const product = await runHierarchyAdminMutation(req, async session => {
        const { value, changedFields } = await mutations.update(req.params.id, req.body, req.user._id, session);
        return { value, event: { action: 'PRODUCT_UPDATED', targetId: value._id, metadata: { changedFields } } };
    });
    res.json({ success: true, product });
});
exports.deleteProduct = catchAsyncErrors(async (req, res, next) => {
    await runHierarchyAdminMutation(req, async session => {
        const product = await mutations.remove(req.params.id, session);
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
    const query = paging.queryContract(req, ['page','limit','productId','id']);
    if (query.productId !== undefined && query.id !== undefined) paging.bad();
    const pagination = paging.parsePagination(query);
    const id = objectId(query.productId || query.id);
    const [product] = await Product.aggregate([
        { $match: { _id: id } },
        { $project: { total: { $size: { $ifNull: ['$reviews', []] } }, reviews: { $slice: [{ $ifNull: ['$reviews', []] }, pagination.skip, pagination.limit] } } },
    ]);
    if (!product) throw new ErrorHander('Produto não encontrado.', 404);
    res.json({ success: true, reviews: product.reviews, pagination: paging.metadata(pagination, product.total) });
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
