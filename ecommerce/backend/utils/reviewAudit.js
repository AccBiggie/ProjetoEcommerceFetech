const { assessReviews, isId } = require('./reviewContract');
async function auditReviews(connection, { write = console.log } = {}) {
    const issues = [], summary = { mode: 'READ_ONLY', products: 0, reviews: 0, issues: 0 };
    for await (const product of connection.db.collection('products').find({}, { projection: { _id: 1, reviews: 1, ratings: 1, numOfReviews: 1 } })) {
        summary.products++;
        const categories = new Set(assessReviews(product));
        const rows = Array.isArray(product.reviews) ? product.reviews : [];
        summary.reviews += rows.length;
        for (const review of rows) {
            if (isId(review?.user) && !await connection.db.collection('users').findOne({ _id: review.user }, { projection: { _id: 1 } })) {
                categories.add('INVALID_REVIEW_USER_REFERENCE');
                issues.push({ category: 'INVALID_REVIEW_USER_REFERENCE', productId: isId(product._id) ? String(product._id) : null,
                    reviewId: isId(review._id) ? String(review._id) : null, userId: String(review.user) });
            }
        }
        for (const category of categories) if (!issues.some(issue => issue.productId === String(product._id) && issue.category === category)) {
            issues.push({ category, productId: isId(product._id) ? String(product._id) : null });
        }
    }
    summary.issues = issues.length;
    write(JSON.stringify(summary));
    for (const issue of issues) write(JSON.stringify(issue));
    return { summary, issues };
}
module.exports = { auditReviews };
