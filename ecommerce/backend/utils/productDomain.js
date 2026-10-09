const money = require('./money');
const ErrorHander = require('./errorHander');
const { validStock } = require('./inventory');
const mutableFields = Object.freeze(['name', 'description', 'price', 'oldPrice', 'Stock', 'category', 'category_id', 'images', 'countDown']);
function fail(code, status = 400, message) {
    const messages = {
        PRODUCT_NOT_FOUND: 'Produto não encontrado.',
        PRODUCT_IN_USE: 'Produto possui histórico de estoque ou pedidos e não pode ser excluído.',
        PRODUCT_PRICE_RELATION_INVALID: 'O preço anterior deve ser maior ou igual ao preço atual.',
        PRODUCT_STOCK_INVALID: 'Estoque deve ser um número inteiro seguro maior ou igual a zero.',
        PRODUCT_CATEGORY_MISMATCH: 'O nome da categoria não corresponde ao identificador informado.',
        PRODUCT_FIELD_NOT_MUTABLE: 'A solicitação contém um campo de produto que não pode ser alterado.',
        PRODUCT_IMAGE_INVALID: 'Informe imagens com identificador não vazio, URL HTTPS ou arquivo local do catálogo e banner válido.',
        PRODUCT_IMAGE_DUPLICATE: 'As imagens não podem repetir o mesmo identificador.',
        PRODUCT_STOCK_LEDGER_INDEX_REQUIRED: 'O índice do histórico de estoque precisa ser atualizado antes desta operação.',
    };
    const error = new ErrorHander(message || messages[code] || 'Produto inválido: ' + code + '.', status);
    error.code = code;
    throw error;
}
function text(value, field) {
    if (typeof value !== 'string' || !value.trim()) fail('PRODUCT_' + field.toUpperCase() + '_INVALID');
    return value.trim();
}
function commercial(record) {
    // F014 expressly supports zero-priced products. No decimal arithmetic.
    const priceCents = money.readCents(record, 'price');
    const oldPriceCents = record.oldPriceCents === null || (record.oldPriceCents === undefined && record.oldPrice == null)
        ? null : money.readCents(record, 'oldPrice');
    if (oldPriceCents !== null && oldPriceCents < priceCents) fail('PRODUCT_PRICE_RELATION_INVALID');
    const off = oldPriceCents ? Number((BigInt(oldPriceCents - priceCents) * 200n + BigInt(oldPriceCents)) / (2n * BigInt(oldPriceCents))) : 0;
    return { priceCents, oldPriceCents, off, installmmentPriceCents: money.splitInstallments(priceCents, 12)[0] };
}
function imageUrl(value) {
    if (typeof value !== 'string' || value !== value.trim()) fail('PRODUCT_IMAGE_INVALID');
    // Existing local catalogue and fallback assets; no arbitrary relative URLs.
    if (/^\/demo-products\/[\p{L}\p{N}_. -]+\.(?:png|jpe?g|webp|gif|svg)$/iu.test(value) && !value.includes('..') || ['/Profile.png', '/logo192.png'].includes(value)) return value;
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return value;
    } catch {}
    fail('PRODUCT_IMAGE_INVALID');
}
function images(value, { stored = false } = {}) {
    if (!Array.isArray(value)) fail('PRODUCT_IMAGE_INVALID');
    const ids = new Set();
    return value.map(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['public_id', 'url', 'banner', ...(stored ? ['_id'] : [])].includes(key))) fail('PRODUCT_IMAGE_INVALID');
        const public_id = text(row.public_id, 'image');
        if (ids.has(public_id)) fail('PRODUCT_IMAGE_DUPLICATE');
        ids.add(public_id);
        return { public_id, url: imageUrl(row.url), banner: imageUrl(row.banner) };
    });
}
function input(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('PRODUCT_INPUT_INVALID');
    if (Object.keys(body).some(key => !mutableFields.includes(key))) fail('PRODUCT_FIELD_NOT_MUTABLE');
    const result = {};
    for (const key of ['name', 'description', 'countDown']) if (Object.hasOwn(body, key)) {
        result[key] = text(body[key], key);
        if (key === 'countDown' && result[key].length > 50) fail('PRODUCT_COUNTDOWN_INVALID');
    }
    for (const key of ['price', 'oldPrice']) if (Object.hasOwn(body, key)) {
        try { result[key + 'Cents'] = key === 'oldPrice' && body[key] === null ? null : money.parseMoneyToCents(body[key]); }
        catch (error) { fail(key === 'price' ? 'PRODUCT_PRICE_INVALID' : 'PRODUCT_OLD_PRICE_INVALID', 400, error.message); }
    }
    if (Object.hasOwn(body, 'Stock')) {
        if (!validStock(body.Stock)) fail('PRODUCT_STOCK_INVALID');
        result.Stock = body.Stock;
    }
    if (Object.hasOwn(body, 'images')) result.images = images(body.images);
    return result;
}
function normalize(body, existing = {}) {
    const patch = input(body), state = { ...existing, ...patch };
    // Validate the complete new state while writing only allowlisted fields.
    text(state.name, 'name'); text(state.description, 'description');
    const countDown = text(state.countDown, 'countDown');
    if (countDown.length > 50) fail('PRODUCT_COUNTDOWN_INVALID');
    if (!validStock(state.Stock)) fail('PRODUCT_STOCK_INVALID');
    images(state.images ?? [], { stored: !Object.hasOwn(body, 'images') });
    if (require('./reviewContract').assessReviews(existing).length) fail('PRODUCT_REVIEW_DATA_INCONSISTENT', 409);
    return { ...patch, ...commercial(state) };
}
module.exports = { mutableFields, fail, text, commercial, images, input, normalize };
