const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { start, Category, Product, State, Audit } = require('./helpers/categoryHierarchyHarness');
const service = require('../backend/services/categoryHierarchyService');
let t;
before(async () => { t = await start(); });
after(async () => { if (t) await t.stop(); });
const missing = '000000000000000000000001';
test('HIER root, child, reparent, root->child e child->root', async () => {
    const a = await t.root(), b = await t.root(), c = await t.root(b._id);
    assert.equal(a.parent_id, null); assert.equal(c.parent_id, b._id);
    assert.equal((await t.update(c._id, { parent_id: a._id }, 200)).result.category.parent_id, a._id);
    assert.equal((await t.update(b._id, { parent_id: a._id }, 200)).result.category.parent_id, a._id);
    assert.equal((await t.update(c._id, { parent_id: null }, 200)).result.category.parent_id, null);
    await t.healthy();
});
for (const parent of ['invalid', '', [], {}, true, 12]) test('HIER parent bruto inválido: ' + JSON.stringify(parent), async () => {
    const n = await Category.countDocuments(), r = await t.request('POST', '/admin/category', { name: 'Invalid', parent_id: parent }, 400);
    assert.equal(r.result.code, 'CATEGORY_INVALID_ID'); assert.equal(await Category.countDocuments(), n);
});
test('HIER parent inexistente retorna 409 e aborta revision/audit', async () => {
    const rev = await t.revision(), count = await Audit.countDocuments();
    const r = await t.request('POST', '/admin/category', { name: 'Missing', parent_id: missing }, 409);
    assert.equal(r.result.code, 'CATEGORY_PARENT_NOT_FOUND'); assert.equal(await t.revision(), rev); assert.equal(await Audit.countDocuments(), count);
});
for (const depth of [1, 2, 3, 12]) test('HIER self/direct/indirect/deep cycle: depth ' + depth, async () => {
    const root = await t.root(); let leaf = root;
    for (let i = 1; i < depth; i++) leaf = await t.root(leaf._id);
    const before = await Category.findById(root._id).lean();
    const r = await t.update(root._id, { parent_id: leaf._id }, 409);
    assert.equal(r.result.code, 'CATEGORY_HIERARCHY_CYCLE'); assert.deepEqual(await Category.findById(root._id).lean(), before);
});
test('HIER self-parent de create é rejeitado pelo helper e ID cliente é ignorado', async () => {
    const id = new mongoose.Types.ObjectId();
    await assert.rejects(service.runHierarchyMutation(session => service.validateParent(id, id, session)), { code: 'CATEGORY_HIERARCHY_CYCLE' });
    const r = await t.request('POST', '/admin/category', { name: 'Server ID', _id: String(id), revision: 9000, createdAt: '2000-01-01' }, 201);
    assert.notEqual(r.result.category._id, String(id)); assert.equal(r.result.category.revision, undefined);
});
test('HIER delete leaf audita ObjectId permanente e requestId', async () => {
    const a = await t.root(), r = await t.remove(a._id, 200), event = await t.event(r);
    assert.equal(await Category.exists({ _id: a._id }), null); assert.equal(event.action, 'CATEGORY_DELETED'); assert.equal(String(event.targetId), a._id);
});
test('HIER delete parent não cascadeia nem reparenta', async () => {
    const a = await t.root(), c = await t.root(a._id), r = await t.remove(a._id, 409);
    assert.equal(r.result.code, 'CATEGORY_HAS_CHILDREN'); assert.equal(String((await Category.findById(c._id)).parent_id), a._id);
});
test('HIER delete Category usada por Product é bloqueado', async () => {
    const a = await t.root(), p = (await t.createProduct(a._id, 201)).result.product;
    assert.equal((await t.remove(a._id, 409)).result.code, 'CATEGORY_IN_USE'); assert.equal(String((await Product.findById(p._id)).category_id), a._id);
});
test('HIER referência legada Product.category também bloqueia delete', async () => {
    const a = await t.root(), p = await Product.create({ ...require('./fixtures').productData(), category: a.name, user: t.admin._id });
    assert.equal((await t.remove(a._id, 409)).result.code, 'CATEGORY_IN_USE'); await Product.deleteOne({ _id: p._id });
});
for (const id of ['invalid', [], {}, true, 12, null]) test('HIER Product category_id inválido: ' + JSON.stringify(id), async () => { await t.createProduct(id, 400); });
test('HIER Product create sem Category e ID inexistente não persistem', async () => {
    const n = await Product.countDocuments(); await t.createProduct(missing, 400);
    await t.request('POST', '/product/new', { ...require('./fixtures').productData(), category: undefined }, 400);
    assert.equal(await Product.countDocuments(), n);
});
test('HIER Product create/update revalida categoria e coordena inclusive update parcial', async () => {
    const a = await t.root(), b = await t.root(); let rev = await t.revision();
    const r = await t.createProduct(a._id, 201), id = r.result.product._id; assert.equal(await t.revision(), ++rev);
    const changed = await t.request('PUT', '/product/' + id, { category_id: b._id }, 200); assert.equal(await t.revision(), ++rev);
    assert.ok((await t.event(changed)).metadata.changedFields.includes('category_id'));
    await t.request('PUT', '/product/' + id, { category: a.name }, 200); assert.equal(await t.revision(), ++rev);
    await t.request('PUT', '/product/' + id, { description: 'Safe update' }, 200); assert.equal(await t.revision(), ++rev);
    await t.request('PUT', '/product/' + id, { category_id: missing }, 400); assert.equal(await t.revision(), rev);
    assert.equal(String((await Product.findById(id)).category_id), a._id);
});
test('HIER F025 create/update metadata segura, allowlist e rename sincronizado', async () => {
    const a = await t.root(), b = await t.root(), p = (await t.createProduct(a._id, 201)).result.product;
    const r = await t.update(a._id, { name: 'PRIVATE_CATEGORY_SENTINEL', parent_id: b._id, revision: 999, createdAt: '2000-01-01', name_key: 'injected' }, 200);
    const event = await t.event(r); assert.equal(event.action, 'CATEGORY_UPDATED'); assert.deepEqual(event.metadata.changedFields, ['name', 'parent_id']);
    assert.ok(!JSON.stringify(event).includes('PRIVATE_CATEGORY_SENTINEL')); assert.equal((await Product.findById(p._id)).category, 'PRIVATE_CATEGORY_SENTINEL');
    assert.notEqual((await Category.findById(a._id).select('+name_key')).name_key, 'injected'); assert.match(r.response.headers.get('cache-control'), /no-store/);
});
for (const operation of ['create', 'update', 'delete', 'product']) test('HIER audit insert failure aborta ' + operation, async () => {
    const a = await t.root(), rev = await t.revision(), original = Audit.create, snapshot = await Category.findById(a._id).lean();
    try {
        Audit.create = async () => { throw new Error('Audit unavailable'); };
        if (operation === 'create') await t.request('POST', '/admin/category', { name: 'Rollback category' }, 500);
        if (operation === 'update') await t.update(a._id, { name: 'Rollback category' }, 500);
        if (operation === 'delete') await t.remove(a._id, 500);
        if (operation === 'product') await t.createProduct(a._id, 500);
    } finally { Audit.create = original; }
    assert.equal(await t.revision(), rev); assert.deepEqual(await Category.findById(a._id).lean(), snapshot); assert.equal(await Category.countDocuments({ name: 'Rollback category' }), 0);
});
for (const kind of ['self', 'cycle', 'missing']) test('HIER legacy ' + kind + ' falha fechado sem repair e permanece legível', async () => {
    const a = await t.root(), b = await t.root();
    await Category.collection.updateOne({ _id: new mongoose.Types.ObjectId(a._id) }, { $set: { parent_id: new mongoose.Types.ObjectId(kind === 'self' ? a._id : kind === 'cycle' ? b._id : missing) } });
    if (kind === 'cycle') await Category.collection.updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { parent_id: new mongoose.Types.ObjectId(a._id) } });
    const before = await Category.findById(a._id).lean();
    for (const body of [{ parent_id: null }, { name: 'No repair' }]) assert.equal((await t.update(a._id, body, 409)).result.code, 'CATEGORY_HIERARCHY_DATA_INCONSISTENT');
    const c = await t.root(); assert.equal((await t.update(c._id, { parent_id: a._id }, 409)).result.code, 'CATEGORY_HIERARCHY_DATA_INCONSISTENT');
    assert.deepEqual(await Category.findById(a._id).lean(), before); await t.request('GET', '/category/' + a._id, null, 200); await t.request('GET', '/categories', null, 200);
    await Category.collection.updateMany({ _id: { $in: [new mongoose.Types.ObjectId(a._id), new mongoose.Types.ObjectId(b._id)] } }, { $set: { parent_id: null } });
});
test('HIER state é interno, permanente, revision sem controle cliente', async () => {
    assert.equal(await State.countDocuments(), 1); assert.ok((await State.listIndexes()).every(i => i.expireAfterSeconds === undefined));
    await t.request('GET', '/admin/category-hierarchy', null, 404); await t.request('POST', '/admin/category-hierarchy', { revision: 9000 }, 404);
    const a = await t.root(), rev = await t.revision(); await t.update(a._id, { revision: 9000 }, 200); assert.equal(await t.revision(), rev + 1);
});
test('HIER helper exige transação', async () => { await assert.rejects(service.coordinate(), /requires a transaction/); });
test('HIER BSON parent malformado não desaparece no casting Mongoose', async () => {
    const a = await t.root(); await Category.collection.updateOne({ _id: new mongoose.Types.ObjectId(a._id) }, { $set: { parent_id: 'PRIVATE_MALFORMED' } });
    const r = await t.update(a._id, { parent_id: null }, 409); assert.equal(r.result.code, 'CATEGORY_HIERARCHY_DATA_INCONSISTENT');
    assert.equal((await Category.collection.findOne({ _id: new mongoose.Types.ObjectId(a._id) })).parent_id, 'PRIVATE_MALFORMED');
    await Category.collection.updateOne({ _id: new mongoose.Types.ObjectId(a._id) }, { $set: { parent_id: null } });
});
test('HIER bodies ausentes/arrays retornam 400', async () => {
    const a = await t.root();
    for (const body of [undefined, []]) {
        await t.request('POST', '/admin/category', body, 400); await t.update(a._id, body, 400);
        await t.request('POST', '/product/new', body, 400); await t.request('PUT', '/product/' + a._id, body, 400);
    }
});
