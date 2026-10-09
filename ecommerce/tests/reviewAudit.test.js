const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const path = require('node:path');
const harness = require('./helpers/observabilityHarness');
const { auditReviews } = require('../backend/utils/reviewAudit');
const { assessReviews } = require('../backend/utils/reviewContract');
const { loadConfig } = require('../backend/config/runtimeConfig');
let env, h, user, collection;
before(async () => { env = await harness.start(); h = env.h; user = await h.createUser(); collection = mongoose.connection.db.collection('products'); });
after(async () => { if (env) await env.stop(); });
const row = (extra = {}) => ({ _id: new mongoose.Types.ObjectId(), user: user._id, name: 'PRIVATE_NAME_SENTINEL', rating: 3, comment: 'PRIVATE_COMMENT_SENTINEL', ...extra });
const product = (extra = {}) => ({ _id: new mongoose.Types.ObjectId(), description: 'PRIVATE_DESCRIPTION_SENTINEL', reviews: [row()], numOfReviews: 1, ratings: 3, ...extra });
async function auditFixture(p) {
    await collection.insertOne(p); const lines = [], result = await auditReviews(mongoose.connection, { write: line => lines.push(line) });
    return { issues: result.issues.filter(i => i.productId === String(p._id)), output: lines.join('\n'), result };
}
test('REVAUD produto consistente não gera finding', async () => { assert.deepEqual((await auditFixture(product())).issues, []); });
test('REVAUD detecta count mismatch', async () => { assert.ok((await auditFixture(product({ numOfReviews: 8 }))).issues.some(i => i.category === 'REVIEW_COUNT_MISMATCH')); });
test('REVAUD detecta rating mismatch', async () => { assert.ok((await auditFixture(product({ ratings: 5 }))).issues.some(i => i.category === 'REVIEW_RATING_MISMATCH')); });
test('REVAUD detecta usuário duplicado', async () => { assert.ok((await auditFixture(product({ reviews: [row(), row()], numOfReviews: 2 }))).issues.some(i => i.category === 'DUPLICATE_REVIEW_USER')); });
for (const rating of ['5', true, null, 4.5, 0, 6, NaN, Infinity]) test(`REVAUD rating inválido ${String(rating)}`, async () => {
    assert.ok((await auditFixture(product({ reviews: [row({ rating })] }))).issues.some(i => i.category === 'INVALID_REVIEW_RATING'));
});
test('REVAUD detecta referência órfã com IDs seguros', async () => {
    const orphan = new mongoose.Types.ObjectId(), r = row({ user: orphan }), p = product({ reviews: [r] });
    const issue = (await auditFixture(p)).issues.find(i => i.category === 'INVALID_REVIEW_USER_REFERENCE'); assert.equal(issue.userId, String(orphan)); assert.equal(issue.reviewId, String(r._id));
});
test('REVAUD referência malformada não imprime valor', async () => {
    const result = await auditFixture(product({ reviews: [row({ user: 'PRIVATE_EMAIL@example.com' })] }));
    assert.ok(result.issues.some(i => i.category === 'INVALID_REVIEW_USER_REFERENCE')); assert.ok(!result.output.includes('PRIVATE_EMAIL'));
});
test('REVAUD usuário desativado não é órfão', async () => {
    const disabled = await h.createUser(); await h.User.collection.updateOne({ _id: disabled._id }, { $set: { accountStatus: 'DEACTIVATED' } });
    assert.deepEqual((await auditFixture(product({ reviews: [row({ user: disabled._id })] }))).issues, []);
});
test('REVAUD média aplica tolerância de 1e-12', async () => {
    assert.deepEqual((await auditFixture(product({ ratings: 3 + 5e-13 }))).issues, []);
    assert.ok((await auditFixture(product({ ratings: 3 + 2e-12 }))).issues.some(i => i.category === 'REVIEW_RATING_MISMATCH'));
});
test('REVAUD array vazio exige média e contagem zero', async () => { assert.deepEqual((await auditFixture(product({ reviews: [], ratings: 0, numOfReviews: 0 }))).issues, []); });
test('REVAUD legado sem campos é vazio válido', async () => { assert.deepEqual((await auditFixture({ _id: new mongoose.Types.ObjectId() })).issues, []); });
for (const reviews of [null, {}, 'PRIVATE_ARRAY_SENTINEL', [null]]) test(`REVAUD estrutura inválida ${Array.isArray(reviews) ? 'linha' : typeof reviews}`, async () => {
    assert.ok((await auditFixture(product({ reviews }))).issues.some(i => i.category === 'INVALID_REVIEW_STRUCTURE'));
});
test('REVAUD ID de avaliação duplicado é sinalizado', async () => {
    const r = row(), other = await h.createUser(); assert.ok((await auditFixture(product({ reviews: [r, { ...r, user: other._id }], numOfReviews: 2 }))).issues.some(i => i.category === 'DUPLICATE_REVIEW_ID'));
});
test('REVAUD não imprime comentário nome email ou descrição', async () => {
    const reply = await auditFixture(product({ numOfReviews: 999 })); assert.ok(!reply.output.includes('PRIVATE_'));
    for (const line of reply.output.split('\n')) assert.ok(Object.keys(JSON.parse(line)).every(k => ['mode', 'products', 'reviews', 'issues', 'category', 'productId', 'reviewId', 'userId'].includes(k)));
});
test('REVAUD somente leitura preserva documentos e indexes byte a byte', async () => {
    const before = await collection.find().sort({ _id: 1 }).toArray(), indexes = await collection.indexes();
    await auditReviews(mongoose.connection, { write: () => {} });
    assert.deepEqual(await collection.find().sort({ _id: 1 }).toArray(), before); assert.deepEqual(await collection.indexes(), indexes);
});
test('REVAUD perfil central não exige secrets de servidor', () => {
    assert.equal(loadConfig({ NODE_ENV: 'test', DB_URI: 'mongodb://127.0.0.1:27017/fetech_fixture' }, { profile: 'reviews-audit' }).profile, 'reviews-audit');
    assert.throws(() => loadConfig({ NODE_ENV: 'invalid', DB_URI: 'bad' }, { profile: 'reviews-audit' }));
});
async function cli(args = []) {
    const child = spawn(process.execPath, [path.join(__dirname, '../backend/scripts/auditReviews.js'), ...args], { env: { ...process.env }, windowsHide: true });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); return { code, output };
}
test('REVAUD CLI executa somente no banco temporário sem mutações', async () => {
    assert.match(mongoose.connection.name, /^fetech_routes_auth_/); const before = await collection.find().toArray();
    const result = await cli(); assert.equal(result.code, 0); assert.match(result.output, /READ_ONLY/); assert.ok(!result.output.includes('PRIVATE_')); assert.deepEqual(await collection.find().toArray(), before);
});
test('REVAUD CLI rejeita apply e argumentos sem conectar ou reparar', async () => {
    const before = await collection.find().toArray(); assert.equal((await cli(['--apply'])).code, 1); assert.equal((await cli(['--help'])).code, 1);
    assert.deepEqual(await collection.find().toArray(), before);
});
test('REVAUD histórico duplicado permanece intacto após análise', async () => {
    const p = product({ reviews: [row(), row()], numOfReviews: 2 }); const before = structuredClone(p);
    assert.ok(assessReviews(p).includes('DUPLICATE_REVIEW_USER')); assert.equal(p.reviews.length, before.reviews.length);
    await auditFixture(p); assert.deepEqual(await collection.findOne({ _id: p._id }), p);
});
