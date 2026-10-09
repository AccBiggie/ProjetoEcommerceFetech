const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Category = require('../backend/models/categoryModel');
const Product = require('../backend/models/productModel');
const { start } = require('./helpers/observabilityHarness');
let env, h, cookie, seq = 0;
before(async () => {
    env = await start(); h = env.h;
    cookie = await h.login(await h.createUser('admin'));
    await Category.init(); await Product.init();
});
after(async () => { if (env) await env.stop(); });
const root = async () => (await h.request('POST', '/admin/category', { name: 'Probe ' + ++seq }, cookie, 201)).result.category;
function barrier(count) {
    let arrived = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    return async () => { if (++arrived === count) release(); await gate; };
}
test('F017 pré-fix: snapshots de documentos distintos permitem write skew', async () => {
    const a = await root(), b = await root(), gate = barrier(2);
    const mutate = async (target, parent) => {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                assert.equal((await Category.findById(parent).session(session)).parent_id, null);
                await gate();
                await Category.updateOne({ _id: target }, { $set: { parent_id: parent } }, { session });
            });
        } finally { await session.endSession(); }
    };
    await Promise.all([mutate(a._id, b._id), mutate(b._id, a._id)]);
    assert.equal(String((await Category.findById(a._id)).parent_id), b._id);
    assert.equal(String((await Category.findById(b._id)).parent_id), a._id);
    console.log(JSON.stringify({ probe: 'PRE_FIX_WRITE_SKEW', a: a._id, aParent: b._id, b: b._id, bParent: a._id, cycle: true }));
});
for (const kind of ['child', 'product']) test('F017 pré-fix: delete concorrente com ' + kind + ' permite órfão', async () => {
    const p = await root(), gate = barrier(2), id = new mongoose.Types.ObjectId();
    const transact = async mutation => { const session = await mongoose.startSession(); try { await session.withTransaction(() => mutation(session)); } finally { await session.endSession(); } };
    await Promise.all([
        transact(async session => {
            assert.ok(await Category.findById(p._id).session(session)); await gate();
            if (kind === 'child') await Category.create([{ _id: id, name: 'Probe child ' + ++seq, name_key: 'probe child ' + seq, parent_id: p._id }], { session });
            else await Product.create([{ ...require('./fixtures').productData(), _id: id, category: p.name, category_id: p._id, user: new mongoose.Types.ObjectId() }], { session });
        }),
        transact(async session => {
            assert.equal(await Category.exists({ parent_id: p._id }).session(session), null);
            assert.equal(await Product.exists({ category_id: p._id }).session(session), null);
            await gate(); await Category.deleteOne({ _id: p._id }, { session });
        }),
    ]);
    assert.equal(await Category.exists({ _id: p._id }), null);
    assert.ok(await (kind === 'child' ? Category : Product).exists({ _id: id }));
    console.log(JSON.stringify({ probe: 'PRE_FIX_' + kind.toUpperCase() + '_DELETE', parent: p._id, reference: String(id), orphan: true }));
});
