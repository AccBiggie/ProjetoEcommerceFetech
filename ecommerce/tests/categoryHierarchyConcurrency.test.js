const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { fork } = require('node:child_process');
const path = require('node:path');
const { start, Category, Product, State, Audit } = require('./helpers/categoryHierarchyHarness');
const service = require('../backend/services/categoryHierarchyService');
let t;
before(async () => { t = await start(); });
after(async () => { if (t) await t.stop(); });
function probe(name, results, final, revision, events) {
    console.log(JSON.stringify({ probe: name, responses: results.map(r => ({ status: r.status, code: r.result?.code })), final, revision, events }));
}
test('HIER concurrent first upserts criam apenas um state e completam mutations independentes', async () => {
    await State.deleteMany({});
    const roots = await Promise.all(Array.from({ length: 20 }, () => t.root()));
    assert.equal(await State.countDocuments(), 1); assert.equal(await t.revision(), 20); assert.equal(roots.length, 20); await t.healthy();
});
test('HIER A->B/B->A repetido 40 vezes nunca produz ciclo', async () => {
    for (let i = 0; i < 40; i++) {
        const a = await t.root(), b = await t.root(), rev = await t.revision();
        const results = await Promise.all([t.update(a._id, { parent_id: b._id }), t.update(b._id, { parent_id: a._id })]);
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(await t.revision(), rev + 1);
        assert.equal(results.find(r => r.status === 409).result.code, 'CATEGORY_HIERARCHY_CYCLE');
        const final = await Category.find({ _id: { $in: [a._id, b._id] } }).select('_id parent_id').lean();
        const events = await Audit.countDocuments({ action: 'CATEGORY_UPDATED', targetId: { $in: [a._id, b._id] } }); assert.equal(events, 1);
        if (i === 0) probe('POST_FIX_TWO_NODE', results, final, await t.revision(), events);
        await t.healthy();
    }
});
test('HIER concurrent three-node cycle rejeita terceiro commit', async () => {
    const a = await t.root(), b = await t.root(), c = await t.root();
    const results = await Promise.all([t.update(a._id, { parent_id: b._id }), t.update(b._id, { parent_id: c._id }), t.update(c._id, { parent_id: a._id })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 409]); await t.healthy();
    probe('POST_FIX_THREE_NODE', results, await Category.find({ _id: { $in: [a._id, b._id, c._id] } }).select('_id parent_id').lean(), await t.revision(), 2);
});
for (const count of [1, 20]) test('HIER concurrent ' + count + ' child create/delete não cria órfão', async () => {
    const p = await t.root();
    const results = await Promise.all([t.remove(p._id), ...Array.from({ length: count }, (_, i) => t.request('POST', '/admin/category', { name: `Child race ${p._id} ${i}`, parent_id: p._id }))]);
    assert.ok(results.every(r => [200, 201, 409].includes(r.status)));
    const parent = await Category.exists({ _id: p._id }), children = await Category.countDocuments({ parent_id: p._id });
    assert.ok(parent || children === 0); await t.healthy(); probe('POST_FIX_CHILD_DELETE_' + count, results, { parentExists: !!parent, children, orphan: false }, await t.revision());
});
for (const kind of ['createId', 'createName', 'updateId', 'updateName']) test('HIER Product ' + kind + '/Category delete nunca cria órfão', async () => {
    const p = await t.root(), old = await t.root();
    const existing = kind.startsWith('update') ? (await t.createProduct(old._id, 201)).result.product : null;
    const body = kind.endsWith('Id') ? { category_id: p._id, category: undefined } : { category: p.name };
    const results = await Promise.all([t.remove(p._id), existing ? t.request('PUT', '/product/' + existing._id, body) : t.request('POST', '/product/new', { ...require('./fixtures').productData(), ...body })]);
    assert.ok([200, 409].includes(results[0].status)); assert.ok([200, 201, 400].includes(results[1].status));
    const parent = await Category.exists({ _id: p._id }), refs = await Product.countDocuments({ category_id: p._id }); assert.ok(parent || refs === 0);
    await t.healthy(); probe('POST_FIX_PRODUCT_DELETE_' + kind, results, { categoryExists: !!parent, products: refs, orphan: false }, await t.revision());
});
for (const target of ['new', 'old']) test('HIER reparent/delete ' + target + ' parent mantém floresta', async () => {
    const old = await t.root(), next = await t.root(), child = await t.root(old._id);
    const results = await Promise.all([t.update(child._id, { parent_id: next._id }), t.remove(target === 'new' ? next._id : old._id)]);
    assert.ok(results.every(r => [200, 409].includes(r.status))); await t.healthy();
});
test('HIER write conflict real força retry e audit persiste uma única vez', async () => {
    const a = await t.root(); let acquired, release;
    const ready = new Promise(resolve => { acquired = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const holder = service.runHierarchyMutation(async () => { acquired(); await gate; });
    await ready;
    const original = service.coordinate; // Count actual failed updates on the common document.
    const collection = mongoose.connection.db.collection('categoryhierarchystates'), proto = Object.getPrototypeOf(collection), update = proto.updateOne;
    let conflicts = 0;
    try {
        proto.updateOne = async function (...args) {
            try { return await update.apply(this, args); }
            catch (error) { if (this.collectionName === 'categoryhierarchystates' && error.hasErrorLabel?.('TransientTransactionError')) { conflicts++; release(); } throw error; }
        };
        const reply = t.update(a._id, { name: 'Retry final' }, 200);
        await Promise.all([holder, reply]); assert.ok(conflicts > 0);
        assert.equal(await Audit.countDocuments({ action: 'CATEGORY_UPDATED', targetId: a._id }), 1);
        assert.equal((await Category.findById(a._id)).name, 'Retry final');
    } finally { release(); proto.updateOne = update; assert.equal(service.coordinate, original); }
});
test('HIER duas conexões Mongo independentes coordenam o mesmo singleton', async () => {
    const a = await t.root(), b = await t.root(), connection = await mongoose.createConnection(process.env.DB_URI).asPromise();
    try {
        const mutate = (target, parent, conn) => service.runHierarchyMutation(async session => {
            await service.validateParent(parent, target, session, { connection: conn });
            await conn.db.collection('categories').updateOne({ _id: new mongoose.Types.ObjectId(target) }, { $set: { parent_id: new mongoose.Types.ObjectId(parent) } }, { session });
        }, { connection: conn });
        const results = await Promise.allSettled([mutate(a._id, b._id, mongoose.connection), mutate(b._id, a._id, connection)]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); await t.healthy();
    } finally { await connection.close(); }
});
test('HIER dois processos API independentes impedem ciclo concorrente', async () => {
    const a = await t.root(), b = await t.root();
    const children = [a, b].map(() => fork(path.join(__dirname, 'helpers/categoryHierarchyWorker.js'), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, CATEGORY_TEST_URI: process.env.DB_URI } }));
    const exchanges = children.map(child => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker timeout')), 20000);
        child.once('error', reject); child.on('message', message => { if (message.ready) resolve({ child, base: message.base }); }); child.once('exit', () => { clearTimeout(timer); });
    }));
    try {
        const workers = await Promise.all(exchanges), { withCsrf } = require('./httpHeaders');
        const request = async (worker, target, parent) => {
            const response = await fetch(worker.base + '/api/v1/admin/category/' + target, { method: 'PUT', headers: { ...withCsrf('PUT'), Cookie: t.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parent }), signal: AbortSignal.timeout(15000) });
            return { status: response.status, result: await response.json() };
        };
        const results = await Promise.all([request(workers[0], a._id, b._id), request(workers[1], b._id, a._id)]);
        assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); await t.healthy();
        probe('POST_FIX_MULTI_PROCESS', results, { cycle: false }, await t.revision(), await Audit.countDocuments({ action: 'CATEGORY_UPDATED', targetId: { $in: [a._id, b._id] } }));
    } finally { await Promise.all(children.map(child => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); }))); }
});
