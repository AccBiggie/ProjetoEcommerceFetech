const mongoose = require('mongoose');
const { testUri } = require('../replicaSetHarness');
async function markOrderPaidFixture(id, connection = mongoose.connection) {
    const expected = new mongoose.mongo.MongoClient(testUri(connection.name)).options;
    const actual = connection.getClient().options;
    if (!/^fetech_(routes_|e2e_)/.test(connection.name) || actual.dbName !== connection.name || actual.replicaSet !== expected.replicaSet ||
        actual.hosts.map(String).join() !== expected.hosts.map(String).join()) throw new Error('Fixture exige banco isolado do runner.');
    return connection.db.collection('orders').updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { paymentStatus: 'PAID', paidAt: new Date() } });
}
async function markE2EOrderPaidFixture(id) {
    const state = JSON.parse(require('node:fs').readFileSync(require('./e2eContext').context().state, 'utf8'));
    if (!/^fetech_e2e_\d+_\d+$/.test(state.database) || state.uri !== testUri(state.database)) throw new Error('Fixture fora do replica set isolado.');
    const connection = await mongoose.createConnection(state.uri).asPromise();
    try { return await markOrderPaidFixture(id, connection); } finally { await connection.close(); }
}
module.exports = { markOrderPaidFixture, markE2EOrderPaidFixture };
