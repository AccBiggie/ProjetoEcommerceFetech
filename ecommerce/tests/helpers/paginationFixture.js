const fixture = require('./productHarness');
const mongoose = require('mongoose');
async function start({ products = 56, orders = 56, users = 56 } = {}) {
    const env = await fixture.start();
    try {
    const product = await fixture.Product.create(fixture.productData({ category_id: env.category._id, category: env.category.name, Stock: 10000, description: 'Descrição detalhada '.repeat(1000) }));
    const clone = product.toObject(); delete clone._id;
    if (products > 1) await fixture.Product.collection.insertMany(Array.from({ length: products - 1 }, (_, i) => ({ ...clone, _id: new mongoose.Types.ObjectId(), name: 'Fixture produto ' + i })));
    const user = await mongoose.models.User.collection.findOne({ _id: env.user._id }); delete user._id;
    if (users > 2) await mongoose.models.User.collection.insertMany(Array.from({ length: users - 2 }, (_, i) => ({ ...user, _id: new mongoose.Types.ObjectId(), email: `fixture${i}@pagination.invalid` })));
    const first = (await env.order(product._id)).result.order;
    const order = await fixture.Order.collection.findOne({ _id: new mongoose.Types.ObjectId(first._id) });
    delete order._id; delete order.idempotencyKeyHash; delete order.idempotencyRequestHash;
    if (orders > 1) {
        const copies = Array.from({ length: orders - 1 }, () => ({ ...order, _id: new mongoose.Types.ObjectId() }));
        await fixture.Order.collection.insertMany(copies);
        await fixture.Movement.collection.insertMany(copies.map((copy, index) => ({ _id: new mongoose.Types.ObjectId(), order: copy._id, product: product._id, type: 'RESERVE', quantity: 1, stockBefore: 9999-index, stockAfter: 9998-index, version: 1, createdAt: copy.createdAt })));
        await fixture.Product.collection.updateOne({ _id: product._id }, { $inc: { Stock: -(orders - 1) } });
    }
    return { ...env, product, counts: { products, orders, users } };
    } catch (error) { await env.stop(); throw error; }
}
module.exports = { ...fixture, start };
