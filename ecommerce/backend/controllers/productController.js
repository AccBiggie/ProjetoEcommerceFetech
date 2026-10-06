const Product = require("../models/productModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ApiFeatures = require("../utils/apiFeatures");
const productFields = ["name", "description", "category", "price", "oldPrice", "installmmentPrice", "off", "countDown", "Stock", "images"];
const productInput = body => Object.fromEntries(productFields.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
exports.createProduct = catchAsyncErrors(async (req, res) => {
    const product = await Product.create({ ...productInput(req.body), user: req.user._id });
    res.status(201).json({ success: true, product });
});
exports.getAllProducts = catchAsyncErrors(async (req, res) => {
    const resultPerPage = 12;
    const feature = new ApiFeatures(Product.find(), req.query).search().filter();
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
    const product = await Product.findByIdAndUpdate(req.params.id, productInput(req.body), { returnDocument: "after", runValidators: true });
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    res.json({ success: true, product });
});
exports.deleteProduct = catchAsyncErrors(async (req, res, next) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    res.json({ success: true, message: "Produto removido." });
});
function recalculateReviews(product) {
    product.numOfReviews = product.reviews.length;
    product.ratings = product.reviews.length ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length : 0;
}
exports.createProductReview = catchAsyncErrors(async (req, res, next) => {
    const { comment, productId } = req.body;
    const rating = Number(req.body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5 || !String(comment || "").trim()) return next(new ErrorHander("Informe uma nota de 1 a 5 e um comentário.", 400));
    const product = await Product.findById(productId);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    const existing = product.reviews.find(review => review.user.toString() === req.user.id);
    const review = { user: req.user._id, name: req.user.name, rating, comment: String(comment).trim() };
    if (existing) Object.assign(existing, review);
    else product.reviews.push(review);
    recalculateReviews(product);
    await product.save();
    res.json({ success: true });
});
exports.getProductReviews = catchAsyncErrors(async (req, res, next) => {
    const product = await Product.findById(req.query.productId || req.query.id);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    res.json({ success: true, reviews: product.reviews });
});
exports.deleteReview = catchAsyncErrors(async (req, res, next) => {
    const product = await Product.findById(req.query.productId);
    if (!product) return next(new ErrorHander("Produto não encontrado.", 404));
    const review = product.reviews.id(req.query.id);
    if (!review) return next(new ErrorHander("Avaliação não encontrada.", 404));
    if (req.user.role !== "admin" && review.user.toString() !== req.user.id) return next(new ErrorHander("Você não pode remover esta avaliação.", 403));
    product.reviews = product.reviews.filter(item => item.id !== review.id);
    recalculateReviews(product);
    await product.save();
    res.json({ success: true });
});
