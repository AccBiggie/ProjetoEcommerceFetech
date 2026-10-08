const { parseMoneyToCents } = require('./money');
const ErrorHander = require("./errorHander");
// Compatibilidade de filtro usa dígitos e inteiro long, nunca double/round.
function priceExpression() {
    const legacy = { $let: { vars: { text: { $convert: { input: '$price', to: 'string', onError: '', onNull: '' } } }, in:
        { $cond: [{ $regexMatch: { input: '$$text', regex: '^\\d+(?:\\.\\d{1,2})?$' } },
            { $let: { vars: { parts: { $split: ['$$text', '.'] } }, in: { $convert: { input: { $concat: [
                { $arrayElemAt: ['$$parts', 0] }, { $substrBytes: [{ $concat: [{ $ifNull: [{ $arrayElemAt: ['$$parts', 1] }, ''] }, '00'] }, 0, 2] }
            ] }, to: 'long', onError: null, onNull: null } } } }, null] } } };
    return { $ifNull: ['$priceCents', legacy] };
}
class ApiFeatures {
    constructor(query, queryStr) { this.query = query; this.queryStr = queryStr; }
    search() {
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
                const boundary = field === "price" ? parseMoneyToCents(value) : Number(value);
                comparisons.push({ $ne: [expression, null] }, { ["$" + operator]: [expression, boundary] });
            }
        }
        if (comparisons.length) filter.$expr = { $and: comparisons };
        this.query = this.query.find(filter);
        return this;
    }
    pagination(resultPerPage) {
        const page = Number(this.queryStr.page || 1);
        if (!Number.isSafeInteger(page) || page < 1) throw new ErrorHander("Página inválida.", 400);
        this.query = this.query.sort({ createdAt: -1, _id: -1 }).limit(resultPerPage).skip(resultPerPage * (page - 1));
        return this;
    }
}
module.exports = ApiFeatures;
