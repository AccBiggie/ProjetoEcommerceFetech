const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { fork } = require('node:child_process');
const path = require('node:path');
const harness = require('./helpers/observabilityHarness');
const Product = require('../backend/models/productModel');
const Audit = require('../backend/models/adminAuditEventModel');
const { productData } = require('./fixtures');
const service = require('../backend/services/productReviewService');
const { assessReviews } = require('../backend/utils/reviewContract');
let env, h, users, cookie, admin, adminCookie;
before(async () => {
    env = await harness.start(); h = env.h;
    users = await Promise.all(Array.from({ length: 20 }, () => h.createUser()));
    cookie = await h.login(users[0]); admin = await h.createUser('admin'); adminCookie = await h.login(admin);
});
after(async () => { if (env) await env.stop(); });
const fresh = () => Product.create(productData({ user: users[0]._id }));
const put = (p, rating = 5, extra = {}, auth = cookie) => h.request('PUT', '/review', { productId: String(p._id), rating, comment: 'Comentário de teste', ...extra }, auth);
const remove = (p, rid, auth = cookie) => h.request('DELETE', `/reviews?productId=${p._id}&id=${rid}`, undefined, auth);
const submit = (p, user, rating) => service.upsert({ productId: p._id, user, body: { rating, comment: 'Teste concorrente' } });
const check = product => {
    assert.deepEqual(assessReviews(product), []);
    assert.equal(product.numOfReviews, product.reviews.length);
    assert.equal(product.ratings, product.reviews.length ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length : 0);
    assert.equal(new Set(product.reviews.map(r => String(r.user))).size, product.reviews.length);
};
test('REV criação responde com snapshot consistente e ID BSON', async () => {
    const p = await fresh(), reply = await put(p, 3); assert.equal(reply.status, 200); checkResponse(reply.result.product);
    assert.match(reply.result.product.reviews[0]._id, /^[a-f\d]{24}$/); assert.equal(reply.result.product.ratings, 3);
});
// HTTP JSON serializes ObjectIds as strings; assess raw BSON only.
const checkResponse = p => { assert.equal(p.numOfReviews, p.reviews.length); assert.equal(p.ratings, p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0); };
test('REV body ausente ou array retorna 400 sem erro interno', async () => {
    for (const body of [undefined, []]) assert.equal((await h.request('PUT', '/review', body, cookie)).status, 400);
});
for (const rating of ['5', true, null, 4.5, 0, 6, -1, {}, []]) test(`REV rejeita rating ${JSON.stringify(rating)}`, async () => {
    const p = await fresh(); assert.equal((await put(p, rating)).status, 400); check(await Product.findById(p._id).lean());
});
for (const rating of [NaN, Infinity, -Infinity, undefined]) test(`REV serviço rejeita rating ${String(rating)}`, async () => {
    const p = await fresh(); await assert.rejects(submit(p, users[0], rating), e => e.statusCode === 400);
});
for (const comment of [null, true, 123, {}, [], '', ' \n\t ', 'x'.repeat(2001)]) test(`REV rejeita comentário ${typeof comment}/${typeof comment === 'string' ? comment.length : 'tipo'}`, async () => {
    const p = await fresh(); assert.equal((await put(p, 5, { comment })).status, 400);
});
test('REV trim e expressão Mongo permanecem texto literal', async () => {
    const p = await fresh(); const reply = await put(p, 4, { comment: '  $reviews.rating  ' });
    assert.equal(reply.status, 200); assert.equal(reply.result.product.reviews[0].comment, '$reviews.rating');
});
test('REV aceita comentário no limite de 2000', async () => { assert.equal((await put(await fresh(), 5, { comment: 'x'.repeat(2000) })).status, 200); });
for (const id of ['invalid', '', 'a'.repeat(23), { $ne: null }, []]) test(`REV rejeita productId ${JSON.stringify(id)}`, async () => {
    assert.equal((await put(await fresh(), 5, { productId: id })).status, 400);
});
test('REV produto inexistente retorna 404', async () => { assert.equal((await put({ _id: new mongoose.Types.ObjectId() })).status, 404); });
test('REV consulta pública valida ID e preserva alias', async () => {
    assert.equal((await h.request('GET', '/reviews?productId=invalid')).status, 400);
    const p = await fresh(); assert.equal((await h.request('GET', `/reviews?id=${p._id}`)).status, 200);
});
test('REV ignora autoria, identidade e agregados do cliente', async () => {
    const p = await fresh(), forged = String(new mongoose.Types.ObjectId());
    const r = await put(p, 2, { user: String(users[1]._id), userId: String(users[1]._id), name: 'Forjado', _id: forged, reviews: [], ratings: 5, numOfReviews: 999 });
    assert.equal(r.status, 200); const row = r.result.product.reviews[0];
    assert.equal(row.user, String(users[0]._id)); assert.equal(row.name, users[0].name); assert.notEqual(row._id, forged); checkResponse(r.result.product);
});
test('REV atualização preserva identidade, posição, count e demais campos', async () => {
    const p = await fresh(); await submit(p, users[0], 2); await submit(p, users[1], 3);
    const before = await Product.findById(p._id).lean(), reply = await put(p, 5);
    const after = await Product.findById(p._id).lean(); check(after); checkResponse(reply.result.product);
    assert.equal(String(after.reviews[0]._id), String(before.reviews[0]._id)); assert.equal(after.numOfReviews, 2); assert.equal(after.ratings, 4);
    for (const field of Object.keys(before).filter(k => !['reviews', 'ratings', 'numOfReviews'].includes(k))) assert.deepEqual(after[field], before[field]);
});
for (const count of [2, 5, 20]) test(`REV ${count} usuários concorrentes preservam todas as avaliações`, async () => {
    const p = await fresh(); const results = await Promise.all(users.slice(0, count).map((u, i) => submit(p, u, count === 2 ? (i ? 5 : 1) : i % 5 + 1)));
    results.forEach(check); const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, count); assert.equal(final.ratings, 3);
});
for (const existing of [false, true]) test(`REV mesmo usuário concorrente ${existing ? 'atualiza' : 'cria'} uma única avaliação`, async () => {
    const p = await fresh(); const initial = existing ? await submit(p, users[0], 3) : null;
    const results = await Promise.all([submit(p, users[0], 1), submit(p, users[0], 5)]); results.forEach(check);
    const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 1); assert.ok([1, 5].includes(final.ratings));
    if (existing) assert.equal(String(final.reviews[0]._id), String(initial.reviews[0]._id));
});
test('REV concorrência mista de create e update preserva A B C', async () => {
    const p = await fresh(); await submit(p, users[0], 2); await submit(p, users[1], 3);
    await Promise.all([submit(p, users[0], 5), submit(p, users[2], 1)]); const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 3); assert.equal(final.ratings, 3);
});
test('REV carga de 100 operações mantém unicidade e todos os snapshots', async () => {
    const p = await fresh(); const results = await Promise.all(Array.from({ length: 100 }, (_, i) => submit(p, users[i % 20], i % 5 + 1)));
    results.forEach(check); const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 20);
});
test('REV duas conexões independentes compartilham garantia atômica', async () => {
    const connection = await mongoose.createConnection(process.env.DB_URI).asPromise();
    try {
        const second = service.createProductReviewService(connection.model('Product', Product.schema)), p = await fresh();
        await Promise.all([submit(p, users[0], 1), second.upsert({ productId: p._id, user: users[1], body: { rating: 5, comment: 'Outra conexão' } })]);
        const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.ratings, 3); assert.equal(final.numOfReviews, 2);
    } finally { await connection.close(); }
});
test('REV duas APIs em processos distintos preservam avaliações e não duplicam usuário', async () => {
    const worker = fork(path.join(__dirname, 'helpers/orderIdempotencyWorker.js'), [], { env: { ...process.env }, silent: true, windowsHide: true });
    try {
        const ready = await new Promise((resolve, reject) => { worker.once('message', v => v.error ? reject(new Error(v.error)) : resolve(v)); worker.once('error', reject); worker.once('exit', () => reject(new Error('Worker encerrado'))); });
        const otherCookie = await h.login(users[1]);
        const remote = (p, auth, rating) => fetch(`http://127.0.0.1:${ready.port}/api/v1/review`, { method: 'PUT', headers: { Cookie: auth, 'Content-Type': 'application/json', 'X-Fetech-CSRF': '1' }, body: JSON.stringify({ productId: String(p._id), rating, comment: 'Processo independente' }), signal: AbortSignal.timeout(15000) }).then(async r => { assert.equal(r.status, 200); return r.json(); });
        const p = await fresh(); await Promise.all([put(p, 1), remote(p, otherCookie, 5)]); let final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 2); assert.equal(final.ratings, 3);
        const same = await fresh(); await Promise.all([put(same, 1), remote(same, cookie, 5)]); final = await Product.findById(same._id).lean(); check(final); assert.equal(final.numOfReviews, 1);
    } finally { if (worker.connected) { const exited = new Promise(resolve => worker.once('exit', resolve)); worker.send('stop'); await exited; } else worker.kill(); }
});
test('REV remoção de última avaliação retorna agregado vazio', async () => {
    const p = await fresh(), created = await submit(p, users[0], 5), reply = await remove(p, created.reviews[0]._id);
    assert.equal(reply.status, 200); assert.deepEqual(reply.result.product.reviews, []); checkResponse(reply.result.product); check(await Product.findById(p._id).lean());
});
test('REV remoção preserva ownership e 404 inexistente', async () => {
    const p = await fresh(), created = await submit(p, users[1], 5);
    assert.equal((await remove(p, created.reviews[0]._id)).status, 403); assert.equal((await remove(p, new mongoose.Types.ObjectId())).status, 404);
    assert.equal((await remove(p, 'invalid')).status, 400); assert.equal((await remove({ _id: new mongoose.Types.ObjectId() }, new mongoose.Types.ObjectId())).status, 404);
});
test('REV create concorrente com delete mantém agregado final', async () => {
    const p = await fresh(), initial = await submit(p, users[0], 2);
    const results = await Promise.all([submit(p, users[1], 5), service.remove({ productId: p._id, reviewId: initial.reviews[0]._id, user: users[0] })]); results.forEach(check);
    const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 1); assert.equal(final.ratings, 5);
});
test('REV deleções concorrentes de usuários diferentes esvaziam agregado', async () => {
    const p = await fresh(); await submit(p, users[0], 1); const initial = await submit(p, users[1], 5);
    const results = await Promise.all(initial.reviews.map((r, i) => service.remove({ productId: p._id, reviewId: r._id, user: users[i] })));
    results.forEach(check); const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 0); assert.equal(final.ratings, 0);
});
test('REV remoção parcial recalcula a média dos sobreviventes', async () => {
    const p = await fresh(); await submit(p, users[0], 1); const initial = await submit(p, users[1], 5);
    const final = await service.remove({ productId: p._id, reviewId: initial.reviews[0]._id, user: users[0] }); check(final); assert.equal(final.ratings, 5); assert.equal(final.numOfReviews, 1);
});
for (const rating of [1, 5]) test(`REV HTTP aceita nota limite ${rating}`, async () => {
    const p = await fresh(), reply = await put(p, rating); assert.equal(reply.status, 200); checkResponse(reply.result.product); assert.equal(reply.result.product.ratings, rating);
});
test('REV create genérico admin rejeita avaliações e agregados', async () => {
    const Category = require('../backend/models/categoryModel');
    const category = await Category.create({ name: 'Categoria Reviews', name_key: 'categoria reviews' });
    const reply = await h.request('POST', '/product/new', productData({ category_id: String(category._id), reviews: [{ user: String(users[0]._id), name: 'Forjado', rating: 5, comment: 'Forjado' }], ratings: 5, numOfReviews: 999 }), adminCookie);
    assert.equal(reply.status, 400); assert.equal(reply.result.code, 'PRODUCT_FIELD_NOT_MUTABLE');
});
test('REV update concorrente com delete da mesma avaliação mantém consistência', async () => {
    const p = await fresh(), initial = await submit(p, users[0], 2);
    const results = await Promise.all([submit(p, users[0], 5), service.remove({ productId: p._id, reviewId: initial.reviews[0]._id, user: users[0] })]); results.forEach(check); check(await Product.findById(p._id).lean());
});
test('REV admin remove avaliação e cria audit sem comentário', async () => {
    const p = await fresh(), initial = await submit(p, users[0], 5); const before = await Audit.countDocuments();
    assert.equal((await remove(p, initial.reviews[0]._id, adminCookie)).status, 200);
    const event = await Audit.findOne({ action: 'PRODUCT_REVIEW_DELETED', targetId: p._id }).lean();
    assert.equal(await Audit.countDocuments(), before + 1); assert.deepEqual(event.metadata, { reviewId: String(initial.reviews[0]._id) });
});
test('REV falha no audit administrativo reverte remoção e agregado', async () => {
    const p = await fresh(), initial = await submit(p, users[0], 5), original = Audit.create;
    try { Audit.create = async () => { throw new Error('PRIVATE_REVIEW_SENTINEL'); }; assert.equal((await remove(p, initial.reviews[0]._id, adminCookie)).status, 500); }
    finally { Audit.create = original; }
    const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 1);
});
test('REV cliente não produz auditoria administrativa', async () => {
    const p = await fresh(), before = await Audit.countDocuments(); await put(p); assert.equal(await Audit.countDocuments(), before);
});
test('REV logs, correlação e no-store preservam privacidade', async () => {
    h.configure({ LOG_LEVEL: 'info' });
    try {
        const p = await fresh(), captured = await harness.capture(() => put(p, 5, { comment: 'PRIVATE_COMMENT_SENTINEL' }));
        assert.equal(captured.result.status, 200); assert.match(captured.result.response.headers.get('x-request-id'), /^[a-f\d-]{36}$/);
        assert.match(captured.result.response.headers.get('cache-control'), /no-store/); assert.ok(!captured.output.includes('PRIVATE_COMMENT_SENTINEL'));
        assert.ok(captured.logs.some(row => row.event === 'http.request.completed'));
    } finally { h.configure(); }
});
test('REV auth e CSRF continuam obrigatórios', async () => {
    const p = await fresh(); assert.equal((await put(p, 5, {}, null)).status, 401);
    assert.equal((await h.request('PUT', '/review', { productId: String(p._id), rating: 5, comment: 'Teste' }, cookie, undefined, { 'X-Fetech-CSRF': '' })).status, 403);
});
test('REV usuário desativado mantém histórico, perde acesso e reativação preserva ID', async () => {
    const user = users[19], auth = await h.login(user), p = await fresh(), initial = await submit(p, user, 2);
    await h.User.collection.updateOne({ _id: user._id }, { $set: { accountStatus: 'DEACTIVATED' }, $inc: { tokenVersion: 1 } });
    assert.equal((await put(p, 5, {}, auth)).status, 401); assert.equal((await Product.findById(p._id).lean()).numOfReviews, 1);
    await h.User.collection.updateOne({ _id: user._id }, { $set: { accountStatus: 'ACTIVE' } });
    assert.equal((await put(p, 5, {}, auth)).status, 401);
    const updated = await put(p, 5, {}, await h.login(await h.User.findById(user._id))); assert.equal(updated.status, 200);
    assert.equal(updated.result.product.reviews[0]._id, String(initial.reviews[0]._id));
});
test('REV endpoint genérico admin rejeita reviews e agregados', async () => {
    const p = await fresh(); await submit(p, users[0], 2);
    const reply = await h.request('PUT', `/product/${p._id}`, { reviews: [], ratings: 5, numOfReviews: 500 }, adminCookie);
    assert.equal(reply.status, 400); assert.equal(reply.result.code, 'PRODUCT_FIELD_NOT_MUTABLE'); const final = await Product.findById(p._id).lean(); check(final); assert.equal(final.numOfReviews, 1); assert.equal(final.ratings, 2);
});
for (const kind of ['count', 'average', 'nanAverage', 'infiniteAverage', 'duplicate', 'invalidRating', 'invalidUser', 'nullArray', 'badRow']) test(`REV histórico ${kind} é bloqueado sem reparo`, async () => {
    const p = await fresh(), initial = await submit(p, users[0], 2);
    const changes = { count: { numOfReviews: 9 }, average: { ratings: 5 }, nanAverage: { ratings: NaN }, infiniteAverage: { ratings: Infinity }, duplicate: { reviews: [...initial.reviews, { ...initial.reviews[0], _id: new mongoose.Types.ObjectId() }], numOfReviews: 2 }, invalidRating: { 'reviews.0.rating': '5' }, invalidUser: { 'reviews.0.user': 'private@example.com' }, nullArray: { reviews: null }, badRow: { reviews: [null] } };
    await Product.collection.updateOne({ _id: p._id }, { $set: changes[kind] }); const before = await Product.findById(p._id).lean();
    const reply = await put(p, 5); assert.equal(reply.status, 409); assert.equal(reply.result.code, 'PRODUCT_REVIEW_DATA_INCONSISTENT');
    assert.deepEqual(await Product.findById(p._id).lean(), before);
});
test('REV deleção também bloqueia agregados históricos incorretos', async () => {
    const p = await fresh(), initial = await submit(p, users[0], 2); await Product.collection.updateOne({ _id: p._id }, { $set: { numOfReviews: 9 } });
    assert.equal((await remove(p, initial.reviews[0]._id)).status, 409); assert.equal((await Product.findById(p._id).lean()).numOfReviews, 9);
});
test('REV campos históricos ausentes equivalem a agregado vazio', async () => {
    const p = await fresh(); await Product.collection.updateOne({ _id: p._id }, { $unset: { reviews: 1, ratings: 1, numOfReviews: 1 } });
    assert.equal((await put(p)).status, 200); check(await Product.findById(p._id).lean());
});
test('REV média não recebe arredondamento', async () => {
    const p = await fresh(); await submit(p, users[0], 1); await submit(p, users[1], 1); const final = await submit(p, users[2], 2); check(final); assert.equal(final.ratings, 4 / 3);
});
test('REV filtro de rating consulta agregado atualizado', async () => {
    const p = await fresh(); await Product.updateOne({ _id: p._id }, { $set: { name: 'FiltroReviewConfiavel' } });
    await submit(p, users[0], 5); const reply = await h.request('GET', '/products?keyword=FiltroReviewConfiavel&ratings[gte]=5');
    assert.equal(reply.status, 200); assert.equal(reply.result.products.length, 1); assert.equal(reply.result.products[0]._id, String(p._id)); assert.equal(reply.result.products[0].ratings, 5);
});
