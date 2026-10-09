const mongoose = require('mongoose');
const { testUri } = require('../replicaSetHarness');
// Teardown only, never an application route or a production lifecycle operation.
async function removeE2EProductFixtures(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) throw new Error('Invalid fixture IDs');
    const state = JSON.parse(require('node:fs').readFileSync(require('./e2eContext').context().state, 'utf8'));
    if (!/^fetech_e2e_\d+_\d+$/.test(state.database) || state.uri !== testUri(state.database)) throw new Error('Fixture requires isolated runner database');
    const connection = await mongoose.createConnection(state.uri, { autoCreate: false, autoIndex: false }).asPromise();
    const session = await connection.startSession();
    try {
        const products = ids.map(id => new mongoose.Types.ObjectId(id));
        await session.withTransaction(async () => {
            const orders = await connection.db.collection('orders').find({ 'orderItems.product': { $in: products } }, { session, projection: { _id: 1 } }).toArray();
            const orderIds = orders.map(o => o._id);
            await connection.db.collection('orderidempotencies').deleteMany({ order: { $in: orderIds } }, { session });
            await connection.db.collection('stockmovements').deleteMany({ $or: [{ product: { $in: products } }, { order: { $in: orderIds } }] }, { session });
            await connection.db.collection('orders').deleteMany({ _id: { $in: orderIds } }, { session });
            await connection.db.collection('products').deleteMany({ _id: { $in: products } }, { session });
        });
    } finally { await session.endSession(); await connection.close(); }
}
module.exports = { removeE2EProductFixtures };
