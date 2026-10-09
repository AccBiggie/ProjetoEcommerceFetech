const { parseMoneyToCents } = require('./money');
const ErrorHander = require("./errorHander");
// Compatibilidade de filtro usa dígitos e inteiro long, nunca double/round.
function priceExpression(field = 'price') {
    const legacy = { $let: { vars: { text: { $convert: { input: '$' + field, to: 'string', onError: '', onNull: '' } } }, in:
        { $cond: [{ $regexMatch: { input: '$$text', regex: '^\\d+(?:\\.\\d{1,2})?$' } },
            { $let: { vars: { parts: { $split: ['$$text', '.'] } }, in: { $convert: { input: { $concat: [
                { $arrayElemAt: ['$$parts', 0] }, { $substrBytes: [{ $concat: [{ $ifNull: [{ $arrayElemAt: ['$$parts', 1] }, ''] }, '00'] }, 0, 2] }
            ] }, to: 'long', onError: null, onNull: null } } } }, null] } } };
    return { $ifNull: ['$' + field + 'Cents', legacy] };
}
class ApiFeatures {
    constructor(query, queryStr) { this.query = query; this.queryStr = queryStr; }
    search() {
        if (this.queryStr.keyword !== undefined && (typeof this.queryStr.keyword !== 'string' || this.queryStr.keyword.trim().length > 100)) require('./pagination').bad();
        if (this.queryStr.keyword) {
            const keyword = String(this.queryStr.keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            this.query = this.query.find({ name: { $regex: keyword, $options: "i" } });
        }
        return this;
    }
    filter() {
        const filter = {};
        if (typeof this.queryStr.category === "string") filter.category = this.queryStr.category;
        const comparisons = [];
        for (const field of ["price", "ratings"]) {
            const values = this.queryStr[field];
            if (!values || typeof values !== "object") continue;
            for (const [operator, value] of Object.entries(values)) {
                if (!["gt", "gte", "lt", "lte"].includes(operator) || !Number.isFinite(Number(value))) throw new ErrorHander("Filtro numérico inválido.", 400);
                const expression = field === "price" ? priceExpression() : "$ratings";
                if (typeof value !== 'string' || !/^[0-9]+(?:\.[0-9]+)?$/.test(value)) require('./pagination').bad();
                const boundary = field === "price" ? parseMoneyToCents(value) : Number(value);
                if (field === 'ratings' && (boundary < 0 || boundary > 5)) require('./pagination').bad();
                comparisons.push({ $ne: [expression, null] }, { ["$" + operator]: [expression, boundary] });
            }
        }
        if (comparisons.length) filter.$expr = { $and: comparisons };
        this.query = this.query.find(filter);
        return this;
    }
    pagination(resultPerPage) {
        const paging = require('./pagination'), { limit, skip } = paging.parsePagination(this.queryStr, resultPerPage);
        this.query = this.query.sort(paging.sort(this.queryStr)).limit(limit).skip(skip);
        return this;
    }
}
module.exports = ApiFeatures;
module.exports.priceExpression = priceExpression;
