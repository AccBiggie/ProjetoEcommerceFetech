const Product = require('../models/productModel');
const { Types } = require('mongoose');
const ErrorHander = require('../utils/errorHander');
const { objectId, reviewInput, safeReviews, consistentReviews, aggregateStage } = require('../utils/reviewContract');
const projection = { _id: 1, reviews: 1, ratings: 1, numOfReviews: 1 };
function createProductReviewService(Model = Product) {
    async function mutate({ productId, user, body, reviewId, session }) {
        const id = objectId(productId), reviewer = objectId(user._id);
        const remove = reviewId !== undefined, rid = remove ? objectId(reviewId) : undefined;
        const payload = remove ? undefined : reviewInput(body, user);
        const filter = { _id: id, $expr: consistentReviews };
        if (remove) filter.reviews = { $elemMatch: { _id: rid, ...(user.role === 'admin' ? {} : { user: reviewer }) } };
        const rows = remove ? { $filter: { input: safeReviews, as: 'r', cond: { $ne: ['$$r._id', { $literal: rid }] } } } : {
            $cond: [
                { $in: [{ $literal: reviewer }, { $map: { input: safeReviews, as: 'r', in: '$$r.user' } }] },
                { $map: { input: safeReviews, as: 'r', in: { $cond: [
                    { $eq: ['$$r.user', { $literal: reviewer }] }, { $mergeObjects: ['$$r', { $literal: payload }] }, '$$r',
                ] } } },
                { $concatArrays: [safeReviews, { $literal: [{ _id: new Types.ObjectId(), ...payload }] }] },
            ],
        };
        const value = await Model.findOneAndUpdate(filter, [{ $set: { reviews: rows } }, aggregateStage], {
            updatePipeline: true, returnDocument: 'after', projection, session,
        }).lean();
        if (value) return value;
        // Diagnosis is read-only; it never supplies the state used by the write.
        const existing = await Model.findById(id).select(projection).session(session || null).lean();
        if (!existing) throw new ErrorHander('Produto não encontrado.', 404);
        if (remove) {
            const review = Array.isArray(existing.reviews) && existing.reviews.find(row => String(row?._id) === String(rid));
            if (!review) throw new ErrorHander('Avaliação não encontrada.', 404);
            if (user.role !== 'admin' && String(review.user) !== String(reviewer)) throw new ErrorHander('Você não pode remover esta avaliação.', 403);
        }
        const error = new ErrorHander('As avaliações deste produto precisam de revisão de integridade.', 409);
        error.code = 'PRODUCT_REVIEW_DATA_INCONSISTENT';
        require('../observability/logger').warn('product.review.data_inconsistent', { targetId: String(id) });
        throw error;
    }
    return { upsert: args => mutate(args), remove: args => mutate(args) };
}
module.exports = { createProductReviewService, ...createProductReviewService() };
