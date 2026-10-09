const ErrorHander = require('./errorHander');
const MAX_LIMIT = 100, MAX_SKIP = 100000;
function bad(code = 'INVALID_QUERY') {
    const error = new ErrorHander('Parâmetros de consulta inválidos.', 400);
    error.code = code; throw error;
}
function queryContract(req, allowed, nested = []) {
    const params = new URL(req.originalUrl, 'http://localhost').searchParams;
    const seen = new Set();
    for (const key of params.keys()) {
        if (seen.has(key) || !allowed.includes(key) && !nested.includes(key)) bad();
        seen.add(key);
    }
    for (const [key, value] of Object.entries(req.query)) {
        if (allowed.includes(key)) { if (typeof value !== 'string') bad(); }
        else if (!nested.some(item => item.startsWith(key + '['))) bad();
        else if (!value || Array.isArray(value) || typeof value !== 'object' || Object.entries(value).some(([operator, item]) => !nested.includes(`${key}[${operator}]`) || typeof item !== 'string')) bad();
    }
    return req.query;
}
function integer(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) bad('INVALID_PAGINATION');
    return Number(value);
}
function parsePagination(query, defaultLimit = 25) {
    const page = integer(query.page, 1), limit = integer(query.limit, defaultLimit, MAX_LIMIT);
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > MAX_SKIP) bad('PAGINATION_RANGE_TOO_LARGE');
    return { page, limit, skip };
}
function metadata({ page, limit }, total) {
    const pages = Math.ceil(total / limit);
    return { page, limit, total, pages, hasNext: page < pages, hasPrevious: page > 1 };
}
function sort(query) {
    if (query.sort !== undefined && !['newest', 'oldest'].includes(query.sort)) bad();
    const direction = query.sort === 'oldest' ? 1 : -1;
    return { createdAt: direction, _id: direction };
}
async function collection(Model, filter, pagination, projection, ordering) {
    const [items, total] = await Promise.all([
        Model.find(filter).select(projection).sort(ordering).skip(pagination.skip).limit(pagination.limit).lean(),
        Model.countDocuments(filter),
    ]);
    return { items, pagination: metadata(pagination, total) };
}
async function reference(Model, filter, ordering, max, projection = '') {
    const items = await Model.find(filter).select(projection).sort(ordering).limit(max + 1).lean();
    if (items.length > max) {
        const error = new ErrorHander('Conjunto de referência excedeu o limite suportado.', 503);
        error.code = 'REFERENCE_SET_TOO_LARGE'; throw error;
    }
    return items;
}
module.exports = { MAX_LIMIT, MAX_SKIP, bad, queryContract, parsePagination, metadata, sort, collection, reference };
