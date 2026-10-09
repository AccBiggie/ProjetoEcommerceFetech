const paging = require('./pagination');
const ApiFeatures = require('./apiFeatures');
const Category = require('../models/categoryModel');
const { categoryKey } = require('./categories');
const productFields = '_id name category category_id price priceCents oldPrice oldPriceCents installmmentPrice installmmentPriceCents off countDown Stock ratings numOfReviews createdAt';
const productProjection = Object.fromEntries(productFields.split(' ').map(field => [field, 1]));
productProjection.images = { $slice: 1 };
async function productFilter(req, Model) {
    const query = paging.queryContract(req, ['page','limit','sort','keyword','category'], ['price[gt]','price[gte]','price[lt]','price[lte]','ratings[gt]','ratings[gte]','ratings[lt]','ratings[lte]']);
    paging.sort(query);
    if (query.keyword !== undefined && query.keyword.trim().length > 100) paging.bad('KEYWORD_TOO_LONG');
    const feature = new ApiFeatures(Model.find(), { ...query, keyword: query.keyword?.trim(), category: undefined }).search().filter();
    if (query.category !== undefined) {
        if (!query.category.trim() || query.category.length > 120) paging.bad();
        const categories = await paging.reference(Category, {}, { createdAt: 1, _id: 1 }, 1000, '_id name parent_id');
        const selected = categories.find(item => String(item._id) === query.category || categoryKey(item.name) === categoryKey(query.category));
        if (selected) {
            const ids = new Set([String(selected._id)]);
            let changed = true;
            while (changed) { changed = false; for (const item of categories) if (ids.has(String(item.parent_id)) && !ids.has(String(item._id))) { ids.add(String(item._id)); changed = true; } }
            feature.query.find({ category_id: { $in: [...ids] } });
        } else feature.query.find({ category: query.category });
    }
    return { filter: feature.query.getFilter(), query };
}
module.exports = { productProjection, productFilter };
