const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { capture } = require('./helpers/observabilityHarness');
const Privacy = require('../backend/models/privacyRequestModel');
const Audit = require('../backend/models/adminAuditEventModel');
const Address = require('../backend/models/addressModel');
const Product = require('../backend/models/productModel');
const { REMOVED_NAME, aliasPattern } = require('../backend/utils/privacyContract');
let t, g, request, snapshot, result, userBefore;
before(async () => {
    t = await require('./helpers/privacyHarness').start(); g = await t.graph(); request = await t.request(g);
    userBefore = await t.h.User.findById(g.user.id).select('+password');
});
after(async () => { await t?.stop(); });
const rows = name => t.db.collection(name).find({}).sort({ _id: 1 }).toArray();
test('PRIV ACTIVE não anonimiza e não altera solicitação', async () => { const reply = await t.execute(g, request, 409); assert.equal(reply.result.code, 'PRIVACY_USER_ACTIVE'); assert.equal((await Privacy.findById(request._id)).status, 'REQUESTED'); });
test('PRIV execução não aceita user não admin ou sem sessão', async () => {
    for (const [cookie, status] of [[g.cookie, 403], [null, 401]]) await t.h.request('POST', '/admin/privacy/requests/' + request._id + '/anonymize', { confirmation: 'ANONIMIZAR ' + g.user.id }, cookie, status);
});
test('PRIV role admin não anonimiza, F010 permanece autoridade', async () => {
    const adminRequest = (await t.h.request('POST', '/me/privacy/anonymization-request', {}, t.adminCookie, 201)).result.request;
    const reply = await t.h.request('POST', '/admin/privacy/requests/' + adminRequest._id + '/anonymize', { confirmation: 'ANONIMIZAR ' + t.admin.id }, t.adminCookie, 409); assert.equal(reply.result.code, 'PRIVACY_USER_ADMIN');
    await t.h.request('PATCH', '/admin/user/' + t.admin.id + '/deactivate', {}, t.adminCookie, 403);
});
test('PRIV confirmação forte exige texto/ID exatos e sem campos extras', async () => {
    await t.deactivate(g);
    for (const body of [{ confirmation: 'SIM' }, { confirmation: 'ANONIMIZAR ' + t.admin.id }, {}, { confirmation: 'ANONIMIZAR ' + g.user.id, email: g.user.email }]) await t.execute(g, request, 400, body);
    assert.equal((await t.h.User.findById(g.user.id)).email, g.user.email);
});
test('PRIV transaction User/Address/review/request/task/audit commit e sem PII no log', async () => {
    snapshot = {}; for (const name of ['orders', 'stockmovements', 'orderidempotencies', 'adminauditevents']) snapshot[name] = await rows(name);
    t.h.configure({ LOG_LEVEL: 'info' }); const captured = await capture(() => t.execute(g, request)); result = captured.result;
    assert.equal(result.result.applied, true); assert.ok(!captured.output.includes(g.user.email));
    for (const sentinel of ['PERSON_NAME_SENTINEL', 'PERSON_ADDRESS_SENTINEL', '13998765432', 'PRIVATE_AVATAR_SENTINEL', 'ANONIMIZAR ']) assert.ok(!captured.output.includes(sentinel));
    const event = await Audit.findOne({ action: 'USER_ANONYMIZED', targetId: g.user._id }).lean(); assert.equal(event.requestId, result.response.headers.get('x-request-id')); assert.deepEqual(event.metadata, { privacyRequestId: request._id });
    t.h.configure({ LOG_LEVEL: 'error' });
});
test('PRIV tombstone conserva identidade e createdAt, estado irreversível', async () => {
    const user = await t.h.User.findById(g.user.id); assert.equal(user.id, g.user.id); assert.equal(user.createdAt.getTime(), userBefore.createdAt.getTime()); assert.equal(user.accountStatus, 'DEACTIVATED'); assert.equal(user.privacyStatus, 'ANONYMIZED');
});
test('PRIV email aleatório UUID .invalid, nome público sem ID ou email anterior', async () => {
    const user = await t.h.User.findById(g.user.id); assert.match(user.email, aliasPattern); assert.ok(!user.email.includes(g.user.email.split('@')[0])); assert.equal(user.name, REMOVED_NAME); assert.ok(!user.name.includes(user.id));
});
test('PRIV password muda por bcrypt, resets limpos, tokenVersion revogado', async () => {
    const user = await t.h.User.findById(g.user.id).select('+password'); assert.match(user.password, /^\$2[aby]\$/); assert.notEqual(user.password, userBefore.password); assert.equal(await user.comparePassword(require('./fixtures').password), false); assert.ok(user.tokenVersion > userBefore.tokenVersion); assert.equal(user.resetPasswordToken, undefined); assert.equal(user.resetPasswordExpire, undefined);
});
test('PRIV Address pessoal removido mas Address de outro owner preservado', async () => {
    assert.equal(await Address.countDocuments({ user: g.user._id }), 0); const other = await t.h.createUser(); const address = await Address.create({ user: other._id, label: 'Outro', ...require('./helpers/privacyHarness').shipping }); assert.ok(await Address.findById(address._id));
});
for (const store of ['orders', 'stockmovements', 'orderidempotencies']) test('PRIV preservação BSON exata de ' + store, async () => assert.deepEqual(await rows(store), snapshot[store]));
test('PRIV Order.user válido, shipping PII retida com prazo UNDEFINED', async () => {
    const order = await t.db.collection('orders').findOne({ user: g.user._id }); assert.ok(await t.h.User.findById(order.user)); assert.equal(order.shippingInfo.address, 'PERSON_ADDRESS_SENTINEL'); assert.equal(order.shippingInfo.phoneNo, '13998765432');
    assert.equal(require('../backend/utils/privacyDataRegistry').registry.find(row => row.store === 'Order' && row.classification === 'SHIPPING_PII').retentionPeriod, 'UNDEFINED');
});
test('PRIV audit histórico não atualizado/deletado e novo evento sem PII', async () => {
    for (const event of snapshot.adminauditevents) assert.deepEqual(await t.db.collection('adminauditevents').findOne({ _id: event._id }), event);
    const event = await Audit.findOne({ action: 'USER_ANONYMIZED', targetId: g.user._id }).lean(); assert.ok(!JSON.stringify(event).includes(g.user.email)); assert.doesNotMatch(JSON.stringify(event), /PERSON_|PRIVATE_AVATAR/);
});
test('PRIV review IDs/user/rating/comment e agregados permanecem', async () => {
    const product = await Product.findById(g.product.id).lean(), review = product.reviews.find(row => String(row.user) === g.user.id); assert.equal(review.name, REMOVED_NAME); assert.equal(review.rating, 5); assert.equal(review.comment, 'Comentário preservado; conteúdo livre não recebe regex.'); assert.equal(product.ratings, 5); assert.equal(product.numOfReviews, product.reviews.length); assert.ok(review._id);
});
test('PRIV managed avatar desvinculado e task durável COMPLETED via fake', async () => {
    const user = await t.h.User.findById(g.user.id); assert.equal(user.avatar.public_id, 'default-avatar'); assert.equal(user.avatar.url, '/Profile.png');
    const task = await require('../backend/models/mediaCleanupTaskModel').findOne({ publicId: g.publicId }); assert.equal(task.status, 'COMPLETED'); assert.equal(task.reason, 'ACCOUNT_ANONYMIZATION'); assert.equal(t.fake.calls.filter(call => call.action === 'destroy' && call.publicId === g.publicId).length, 1);
});
test('PRIV repetição idempotente não muda alias/versão/audit/provider', async () => {
    const before = await t.h.User.findById(g.user.id).lean(), calls = t.fake.calls.length; const replay = await t.execute(g, request); assert.equal(replay.result.applied, false); assert.deepEqual(await t.h.User.findById(g.user.id).lean(), before); assert.equal(t.fake.calls.length, calls); assert.equal(await Audit.countDocuments({ action: 'USER_ANONYMIZED', targetId: g.user._id }), 1);
});
test('PRIV sessão antiga e JWT fabricado atual não autenticam', async () => {
    await t.h.request('GET', '/me', null, g.cookie, 401); const user = await t.h.User.findById(g.user.id); const token = jwt.sign({ id: g.user.id, tokenVersion: user.tokenVersion }, require('../backend/config/runtimeConfig').getRuntimeConfig().jwt.secret);
    await t.h.request('GET', '/me', null, 'token=' + token, 401);
});
test('PRIV login e forgot tombstone não autentica/não envia email', async () => {
    await t.h.clearRateLimits(); const user = await t.h.User.findById(g.user.id), count = t.h.mailCount();
    await t.h.request('POST', '/login', { email: user.email, password: require('./fixtures').password }, null, 401);
    await t.h.request('POST', '/password/forgot', { email: user.email }, null, 200); assert.equal(t.h.mailCount(), count); assert.equal((await t.h.User.findById(g.user.id)).resetPasswordToken, undefined);
});
test('PRIV reactivation e admin profile update rejeitam tombstone com 409', async () => {
    for (const [method, route, body] of [['PATCH', '/admin/user/' + g.user.id + '/reactivate', {}], ['PUT', '/admin/user/' + g.user.id, { name: 'PII voltou', role: 'admin' }]]) { const reply = await t.h.request(method, route, body, t.adminCookie, 409); assert.equal(reply.result.code, 'USER_ANONYMIZED'); }
});
test('PRIV model/query/collection/bulk não restauram privacyStatus/PII', async () => {
    const filter = { _id: g.user._id }, update = { $set: { privacyStatus: 'NORMAL', accountStatus: 'ACTIVE', name: 'PII voltou' } };
    assert.equal((await t.h.User.updateOne(filter, update)).modifiedCount, 0); assert.equal((await t.h.User.collection.updateOne(filter, update)).modifiedCount, 0);
    await assert.rejects(t.h.User.bulkWrite([{ updateOne: { filter, update } }], { skipMiddleware: true })); assert.equal((await t.h.User.findById(g.user.id)).privacyStatus, 'ANONYMIZED');
});
test('PRIV email original pode cadastrar nova identidade sem religar histórico', async () => {
    await t.h.clearRateLimits(); const reply = await t.h.request('POST', '/register', { name: 'Nova conta', email: g.user.email, password: require('./fixtures').password }, null, 201); assert.notEqual(reply.result.user._id, g.user.id); assert.equal(reply.result.user.privacyStatus, 'NORMAL'); assert.equal(await t.db.collection('orders').countDocuments({ user: g.user._id }), 1);
});
for (const target of ['audit', 'address', 'review', 'request', 'cleanup']) test('PRIV rollback atômico em falha de ' + target, async context => {
    const fresh = await t.graph(), pending = await t.request(fresh); await t.deactivate(fresh);
    const before = await t.h.User.findById(fresh.user.id).select('+password').lean();
    const model = { audit: Audit, address: Address, review: Product, request: Privacy, cleanup: require('../backend/models/mediaCleanupTaskModel') }[target];
    const method = { audit: 'create', address: 'deleteMany', review: 'updateMany', request: 'save', cleanup: 'findOneAndUpdate' }[target];
    const object = target === 'request' ? Privacy.prototype : model;
    context.mock.method(object, method, () => { throw new Error('PRIVATE_FAILURE_SENTINEL'); });
    await t.execute(fresh, pending, 500); assert.deepEqual(await t.h.User.findById(fresh.user.id).select('+password').lean(), before); assert.ok(await Address.findById(fresh.address._id)); assert.equal((await Privacy.findById(pending._id)).status, 'REQUESTED'); assert.equal(await Audit.countDocuments({ action: 'USER_ANONYMIZED', targetId: fresh.user._id }), 0);
});
test('PRIV duas execuções concorrentes criam um só efeito/audit', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh); await t.deactivate(fresh); const replies = await Promise.all([t.execute(fresh, pending), t.execute(fresh, pending)]); assert.equal(replies.filter(reply => reply.result.applied).length, 1); assert.equal(await Audit.countDocuments({ action: 'USER_ANONYMIZED', targetId: fresh.user._id }), 1);
});
test('PRIV falha destroy mantém tombstone COMPLETED com task PENDING', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh); await t.deactivate(fresh); t.fake.destroyFailure = true;
    try { await t.execute(fresh, pending); assert.equal((await Privacy.findById(pending._id)).status, 'COMPLETED'); assert.equal((await t.h.User.findById(fresh.user.id)).privacyStatus, 'ANONYMIZED'); assert.equal((await require('../backend/models/mediaCleanupTaskModel').findOne({ publicId: fresh.publicId })).status, 'PENDING'); }
    finally { t.fake.destroyFailure = false; }
});
test('PRIV unmanaged legacy media BLOCKED, não adivinha destroy', async () => {
    const fresh = await t.graph(); await t.h.User.updateOne({ _id: fresh.user._id }, { $set: { avatar: { public_id: 'legacy-unmanaged-' + crypto.randomUUID(), url: 'https://example.test/legacy.png' } } });
    const pending = await t.request(fresh); await t.deactivate(fresh); const calls = t.fake.calls.length; await t.execute(fresh, pending);
    assert.equal(t.fake.calls.length, calls); assert.equal((await require('../backend/models/mediaCleanupTaskModel').findOne({ user: fresh.user._id, reason: 'ACCOUNT_ANONYMIZATION' })).status, 'BLOCKED');
});
test('PRIV asset compartilhado protegido de destroy e task BLOCKED', async () => {
    const fresh = await t.graph(), other = await t.h.createUser(); await t.h.User.updateOne({ _id: other._id }, { $set: { avatar: { public_id: fresh.publicId, url: 'https://example.test/shared.png' } } });
    const pending = await t.request(fresh); await t.deactivate(fresh); const calls = t.fake.calls.length; await t.execute(fresh, pending); assert.equal(t.fake.calls.length, calls); assert.equal((await require('../backend/models/mediaCleanupTaskModel').findOne({ publicId: fresh.publicId })).failureCode, 'STILL_REFERENCED');
});
test('PRIV late authenticated Address/review writer cannot restore data after anonymization', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh), stale = await t.h.User.findById(fresh.user.id);
    await t.deactivate(fresh); await t.execute(fresh, pending);
    let called = false;
    await assert.rejects(require('../backend/services/privacySensitiveWrite').withPrivacySensitiveWrite(stale, async () => { called = true; }));
    assert.equal(called, false); assert.equal(await Address.countDocuments({ user: fresh.user._id }), 0);
    await assert.rejects(require('../backend/services/productReviewService').upsert({ user: stale, productId: fresh.product.id, body: { rating: 1, comment: 'late writer' } }));
    assert.equal((await Product.findById(fresh.product.id)).reviews.find(row => String(row.user) === fresh.user.id).name, REMOVED_NAME);
});
test('PRIV concurrent reactivation and anonymization share Mongo authority', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh); await t.deactivate(fresh);
    const results = await Promise.all([
        t.h.request('POST', '/admin/privacy/requests/' + pending._id + '/anonymize', { confirmation: 'ANONIMIZAR ' + fresh.user.id }, t.adminCookie),
        t.h.request('PATCH', '/admin/user/' + fresh.user.id + '/reactivate', {}, t.adminCookie),
    ]);
    const user = await t.h.User.findById(fresh.user.id);
    if (user.privacyStatus === 'ANONYMIZED') { assert.equal(user.accountStatus, 'DEACTIVATED'); assert.equal(results[0].status, 200); assert.equal(results[1].status, 409); }
    else { assert.equal(user.accountStatus, 'ACTIVE'); assert.equal(results[1].status, 200); assert.equal(results[0].status, 409); }
});
test('PRIV cancelled request cannot execute and completed cannot cancel', async () => {
    const fresh = await t.graph(), pending = await t.request(fresh);
    await t.h.request('PATCH', '/me/privacy/anonymization-request/cancel', {}, fresh.cookie, 200); await t.deactivate(fresh);
    const reply = await t.execute(fresh, pending, 409); assert.equal(reply.result.code, 'PRIVACY_REQUEST_NOT_ACTIVE');
    await t.h.request('PATCH', '/me/privacy/anonymization-request/cancel', {}, g.cookie, 401);
});
test('PRIV default avatar requires no provider task', async () => {
    const fresh = await t.graph(); await t.h.User.updateOne({ _id: fresh.user._id }, { $set: { avatar: { public_id: 'default-avatar', url: '/Profile.png' } } });
    const pending = await t.request(fresh); await t.deactivate(fresh); const calls = t.fake.calls.length; await t.execute(fresh, pending);
    assert.equal(t.fake.calls.length, calls); assert.equal(await require('../backend/models/mediaCleanupTaskModel').countDocuments({ user: fresh.user._id, reason: 'ACCOUNT_ANONYMIZATION' }), 0);
});
for (const [field, value] of Object.entries({ name: 'PERSON_NAME_SENTINEL', email: 'PERSON_EMAIL_SENTINEL@example.test', password: 'PERSON_PASSWORD_SENTINEL', avatar: { public_id: 'PERSON_AVATAR_SENTINEL', url: '/PII.png' }, role: 'admin', accountStatus: 'ACTIVE', privacyStatus: 'NORMAL', resetPasswordToken: 'PERSON_RESET_SENTINEL', resetPasswordExpire: new Date() })) test('PRIV native commercial update cannot restore ' + field, async () => {
    assert.equal((await t.h.User.collection.updateOne({ _id: g.user._id }, { $set: { [field]: value } })).modifiedCount, 0);
});
test('PRIV rename destination and pipeline cannot bypass irreversible guard', async () => {
    assert.equal((await t.h.User.collection.updateOne({ _id: g.user._id }, { $rename: { createdAt: 'name' } })).modifiedCount, 0);
    assert.equal((await t.h.User.collection.updateOne({ _id: g.user._id }, [{ $set: { privacyStatus: 'NORMAL' } }])).modifiedCount, 0);
});
test('PRIV previously loaded User document cannot save old PII back', async () => {
    userBefore.name = 'PERSON_STALE_NAME_SENTINEL'; await assert.rejects(userBefore.save()); assert.equal((await t.h.User.findById(g.user.id)).name, REMOVED_NAME);
});
