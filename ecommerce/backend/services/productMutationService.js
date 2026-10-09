const Product = require('../models/productModel');
const Movement = require('../models/stockMovementModel');
const Order = require('../models/orderModel');
const domain = require('../utils/productDomain');
const { resolveProductCategory } = require('../utils/categories');
const { productFields } = require('../utils/money');
async function prepareStockLedger() {
    await Movement.init();
    if ((await Movement.collection.listIndexes().toArray()).some(index => index.name === 'one_order_product_movement')) domain.fail('PRODUCT_STOCK_LEDGER_INDEX_REQUIRED', 503);
}
function createProductMutationService({ ProductModel = Product, MovementModel = Movement, OrderModel = Order, resolveCategory = resolveProductCategory } = {}) {
    async function movement(product, before, after, actor, session, initial = false) {
        if (before === after) return;
        await MovementModel.create([{ product: product._id, type: initial ? 'INITIAL_STOCK' : 'ADMIN_ADJUSTMENT',
            version: 1, delta: after - before, stockBefore: before, stockAfter: after,
            actorUserId: actor, reason: initial ? 'PRODUCT_INITIAL_STOCK' : 'ADMIN_PRODUCT_STOCK_UPDATE' }], { session });
    }
    return {
        async create(body, actor, session) {
            const fields = domain.normalize(body, { Stock: 1, images: [] });
            const category = await resolveCategory(body, session);
            if (!category.category_id) domain.fail('PRODUCT_CATEGORY_MISSING');
            const [value] = await ProductModel.create([{ ...fields, ...category, user: actor, stockLedgerVersion: 1 }], { session });
            await movement(value, 0, value.Stock, actor, session, true);
            return value;
        },
        async update(id, body, actor, session) {
            const existing = await ProductModel.findById(id).session(session).lean();
            if (!existing) domain.fail('PRODUCT_NOT_FOUND', 404);
            const fields = domain.normalize(body, existing);
            const selection = body.category_id !== undefined || body.category !== undefined ? body
                : existing.category_id ? { category_id: existing.category_id } : { category: existing.category };
            const category = await resolveCategory(selection, session);
            const value = await ProductModel.findByIdAndUpdate(id, { $set: { ...fields, ...category },
                $unset: Object.fromEntries(productFields.map(field => [field, 1])) }, { returnDocument: 'after', runValidators: true, session });
            if (fields.Stock !== undefined) await movement(value, existing.Stock, value.Stock, actor, session);
            const changedFields = [...new Set([...Object.keys(fields), ...Object.keys(category)])]
                .filter(key => JSON.stringify(existing[key]) !== JSON.stringify(value[key]));
            return { value, changedFields };
        },
        async remove(id, session) {
            const product = await ProductModel.findById(id).session(session);
            if (!product) domain.fail('PRODUCT_NOT_FOUND', 404);
            if (await MovementModel.exists({ product: id }).session(session) || await OrderModel.exists({ 'orderItems.product': id }).session(session)) domain.fail('PRODUCT_IN_USE', 409);
            await ProductModel.deleteOne({ _id: id }, { session });
            return product;
        },
    };
}
module.exports = { ...createProductMutationService(), createProductMutationService, prepareStockLedger };
