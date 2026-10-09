const { Types } = require('mongoose');
const ErrorHander = require('./errorHander');
const TOLERANCE = 1e-12;
const COMMENT_MAX = 2000;
const isId = value => value instanceof Types.ObjectId;
const validRating = value => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
function objectId(value) {
    if (isId(value)) return value;
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ErrorHander('Identificador inválido.', 400);
    return new Types.ObjectId(value);
}
function reviewInput(body, user) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !validRating(body.rating) || typeof body.comment !== 'string' || !body.comment.trim() || body.comment.trim().length > COMMENT_MAX) {
        throw new ErrorHander('Informe uma nota inteira de 1 a 5 e um comentário de até 2000 caracteres.', 400);
    }
    return { user: objectId(user._id), name: user.name, rating: body.rating, comment: body.comment.trim() };
}
// Uses raw documents: hydration defaults/casting must not hide historical corruption.
function assessReviews(product) {
    const issues = new Set(), rows = product.reviews === undefined ? [] : product.reviews;
    if (!Array.isArray(rows)) return ['INVALID_REVIEW_STRUCTURE'];
    const users = new Set(), ids = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') { issues.add('INVALID_REVIEW_STRUCTURE'); continue; }
        if (!isId(row._id) || typeof row.name !== 'string' || !row.name.trim() || typeof row.comment !== 'string' || !row.comment.trim()) issues.add('INVALID_REVIEW_STRUCTURE');
        if (!isId(row.user)) issues.add('INVALID_REVIEW_USER_REFERENCE');
        else if (users.has(String(row.user))) issues.add('DUPLICATE_REVIEW_USER');
        else users.add(String(row.user));
        if (isId(row._id) && ids.has(String(row._id))) issues.add('DUPLICATE_REVIEW_ID');
        ids.add(String(row._id));
        if (!validRating(row.rating)) issues.add('INVALID_REVIEW_RATING');
    }
    if ((product.numOfReviews ?? 0) !== rows.length || product.numOfReviews === null) issues.add('REVIEW_COUNT_MISMATCH');
    const mean = rows.length ? rows.reduce((sum, row) => sum + (validRating(row?.rating) ? row.rating : NaN), 0) / rows.length : 0;
    const stored = product.ratings === undefined ? 0 : product.ratings;
    if (typeof stored !== 'number' || !Number.isFinite(stored) || !Number.isFinite(mean) || Math.abs(stored - mean) > TOLERANCE) issues.add('REVIEW_RATING_MISMATCH');
    return [...issues];
}
const safeReviews = { $cond: [{ $isArray: '$reviews' }, '$reviews', []] };
const numeric = value => ({ $in: [{ $type: value }, ['double', 'int', 'long']] });
const nonblank = value => ({ $cond: [{ $eq: [{ $type: value }, 'string'] }, { $gt: [{ $strLenCP: { $trim: { input: value } } }, 0] }, false] });
const stored = field => ({ $cond: [{ $eq: [{ $type: field }, 'missing'] }, 0, field] });
// Every expression is safe even when Mongo evaluates all branches of $and.
const consistentReviews = { $let: { vars: { rows: safeReviews }, in: { $and: [
    { $in: [{ $type: '$reviews' }, ['array', 'missing']] },
    { $allElementsTrue: [{ $map: { input: '$$rows', as: 'r', in: { $and: [
        { $eq: [{ $type: '$$r._id' }, 'objectId'] }, { $eq: [{ $type: '$$r.user' }, 'objectId'] },
        numeric('$$r.rating'), { $in: ['$$r.rating', [1, 2, 3, 4, 5]] }, nonblank('$$r.name'), nonblank('$$r.comment'),
    ] } } }] },
    ...['user', '_id'].map(field => ({ $eq: [{ $size: '$$rows' }, { $size: { $setUnion: [{ $map: { input: '$$rows', as: 'r', in: '$$r.' + field } }, []] } }] })),
    numeric(stored('$numOfReviews')), { $eq: [stored('$numOfReviews'), { $size: '$$rows' }] },
    numeric(stored('$ratings')),
    // Mongo orders BSON NaN below ordinary numbers; tolerance alone is insufficient.
    { $gte: [stored('$ratings'), 0] }, { $lte: [stored('$ratings'), 5] },
    { $lte: [{ $abs: { $subtract: [
        { $cond: [numeric(stored('$ratings')), stored('$ratings'), 1e99] },
        { $ifNull: [{ $avg: '$$rows.rating' }, 0] },
    ] } }, TOLERANCE] },
] } } };
const aggregateStage = { $set: { numOfReviews: { $size: '$reviews' }, ratings: { $ifNull: [{ $avg: '$reviews.rating' }, 0] } } };
module.exports = { TOLERANCE, COMMENT_MAX, validRating, isId, objectId, reviewInput, assessReviews, safeReviews, consistentReviews, aggregateStage };
