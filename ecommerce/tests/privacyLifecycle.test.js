const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./authHarness');
let user, admin, cookie, adminCookie;
before(async () => { await h.start(); user = await h.createUser(); admin = await h.createUser('admin'); cookie = await h.login(user); adminCookie = await h.login(admin); });
after(h.stop);
test('PRIV pré-fix F016 mantém PII após desativação; não equivale a anonimização', async () => {
    const original = await h.User.findById(user.id).select('+password');
    await h.request('PATCH', '/admin/user/' + user.id + '/deactivate', {}, adminCookie, 200);
    const row = await h.User.findById(user.id).select('+password');
    assert.equal(row.name, original.name); assert.equal(row.email, original.email); assert.equal(row.password, original.password);
    await h.request('PATCH', '/admin/user/' + user.id + '/reactivate', {}, adminCookie, 200); cookie = await h.login(await h.User.findById(user.id));
});
test('PRIV novo User possui privacyStatus NORMAL', async () => assert.equal((await h.User.findById(user.id)).privacyStatus, 'NORMAL'));
test('PRIV publicUser legacy response normalizes status without exposing internal fence', () => {
    const row = require('../backend/utils/userLifecycle').publicUser({ name: 'Fixture', privacyMutationVersion: 12 }); assert.equal(row.privacyStatus, 'NORMAL'); assert.equal(row.privacyMutationVersion, undefined);
});
for (const value of [null, 'UNKNOWN', ['NORMAL']]) test('PRIV corrupt privacyStatus fails authentication closed: ' + JSON.stringify(value), async () => {
    const target = await h.createUser(), cookie = await h.login(target), users = h.User.db.db.collection('users');
    try { await users.updateOne({ _id: target._id }, { $set: { privacyStatus: value } }); await h.request('GET', '/me', null, cookie, 401); }
    finally { await users.updateOne({ _id: target._id }, { $set: { privacyStatus: 'NORMAL' } }); }
});
test('PRIV public register cannot mass-assign privacyStatus or internal fence', async () => {
    await h.clearRateLimits(); const reply = await h.request('POST', '/register', { name: 'Fixture privacy', email: 'privacy-massassign@example.test', password: h.password, privacyStatus: 'ANONYMIZED', privacyMutationVersion: 999 }, null, 201);
    const user = await h.User.findById(reply.result.user._id).select('+privacyMutationVersion'); assert.equal(user.privacyStatus, 'NORMAL'); assert.equal(user.privacyMutationVersion, 0);
});
test('PRIV public profile update cannot mass-assign privacyStatus', async () => {
    const target = await h.createUser(), auth = await h.login(target);
    await h.request('PUT', '/me/update', { name: 'Fixture name', email: target.email, privacyStatus: 'ANONYMIZED', privacyMutationVersion: 999 }, auth, 200);
    const user = await h.User.findById(target.id).select('+privacyMutationVersion'); assert.equal(user.privacyStatus, 'NORMAL'); assert.equal(user.privacyMutationVersion, 0);
});
test('PRIV solicitação persiste sem executar/desativar a conta', async () => {
    const reply = await h.request('POST', '/me/privacy/anonymization-request', {}, cookie, 201);
    assert.equal(reply.result.request.status, 'REQUESTED'); assert.equal((await h.User.findById(user.id)).accountStatus, 'ACTIVE');
});
test('PRIV legacy missing é NORMAL sem migration', async () => {
    const legacy = await h.createUser(); await h.User.updateOne({ _id: legacy._id }, { $unset: { privacyStatus: '' } });
    assert.equal(require('../backend/utils/privacyContract').privacyStatusOf(await h.User.db.db.collection('users').findOne({ _id: legacy._id })), 'NORMAL');
    await h.request('GET', '/me', null, await h.login(legacy), 200); assert.equal((await h.User.db.db.collection('users').findOne({ _id: legacy._id })).privacyStatus, undefined);
});
test('PRIV requests concorrentes criam uma só ativa', async () => {
    await h.clearRateLimits(); const other = await h.createUser(), auth = await h.login(other);
    const replies = await Promise.all(Array.from({ length: 4 }, () => h.request('POST', '/me/privacy/anonymization-request', {}, auth)));
    assert.ok(replies.every(reply => [200, 201].includes(reply.status))); assert.equal(new Set(replies.map(reply => reply.result.request._id)).size, 1);
    assert.equal(await require('../backend/models/privacyRequestModel').countDocuments({ user: other._id, status: 'REQUESTED' }), 1);
});
test('PRIV request não aceita cópia de PII ou actor no body', async () => {
    await h.clearRateLimits(); for (const body of [{ email: 'sentinel@example.test' }, { name: 'sentinel' }, { user: admin.id }, { reason: 'free text' }, { privacyStatus: 'ANONYMIZED' }]) await h.request('POST', '/me/privacy/anonymization-request', body, cookie, 400);
});
test('PRIV self request/status/overview não aceitam cross-user query', async () => {
    for (const route of ['/me/privacy/anonymization-request', '/me/privacy/data-overview']) await h.request('GET', route + '?user=' + admin.id, null, cookie, 400);
    const other = await h.createUser(), reply = await h.request('GET', '/me/privacy/anonymization-request', null, await h.login(other), 200); assert.equal(reply.result.request, null);
});
test('PRIV self status não expõe processedBy/requestId/internal fields', async () => {
    const reply = await h.request('GET', '/me/privacy/anonymization-request', null, cookie, 200); assert.doesNotMatch(JSON.stringify(reply.result), /processedBy|requestId|privacyMutationVersion|email/);
    assert.match(reply.response.headers.get('cache-control'), /no-store/);
});
test('PRIV não autenticado não acessa rotas privadas', async () => { for (const route of ['/me/privacy/anonymization-request', '/me/privacy/data-overview', '/admin/privacy/requests']) await h.request('GET', route, null, null, 401); });
test('PRIV self mutation exige CSRF', async () => { await h.request('POST', '/me/privacy/anonymization-request', {}, cookie, 403, { 'X-Fetech-CSRF': null }); });
test('PRIV abuso encontra limiter F008 e não copia email/IP', async () => {
    await h.clearRateLimits(); const target = await h.createUser(), auth = await h.login(target);
    for (let i = 0; i < 5; i++) await h.request('POST', '/me/privacy/anonymization-request', {}, auth, i ? 200 : 201);
    const blocked = await h.request('POST', '/me/privacy/anonymization-request', {}, auth, 429); assert.ok(blocked.response.headers.get('retry-after'));
    const rows = await h.User.db.db.collection('authratelimits').find({ scope: 'privacy:user' }).toArray(); assert.equal(rows.length, 1); assert.match(rows[0]._id, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(rows).includes(target.email));
});
test('PRIV cancel mantém conta ativa e permite nova solicitação distinta', async () => {
    await h.clearRateLimits(); const a = await h.request('PATCH', '/me/privacy/anonymization-request/cancel', {}, cookie, 200); assert.equal(a.result.request.status, 'CANCELLED');
    assert.equal((await h.User.findById(user.id)).privacyStatus, 'NORMAL'); assert.equal((await h.User.findById(user.id)).accountStatus, 'ACTIVE');
    const b = await h.request('POST', '/me/privacy/anonymization-request', {}, cookie, 201); assert.notEqual(a.result.request._id, b.result.request._id);
});
test('PRIV request ativo permanece após desativação e JWT perde acesso', async () => {
    await h.request('PATCH', '/admin/user/' + user.id + '/deactivate', {}, adminCookie, 200); await h.request('POST', '/me/privacy/anonymization-request', {}, cookie, 401);
    assert.equal(await require('../backend/models/privacyRequestModel').countDocuments({ user: user._id, status: 'REQUESTED' }), 1);
});
test('PRIV queue somente admin, paginada e sem perfil PII', async () => {
    const regular = await h.login(await h.createUser()); await h.request('GET', '/admin/privacy/requests', null, regular, 403);
    const reply = await h.request('GET', '/admin/privacy/requests?limit=1', null, adminCookie, 200); assert.equal(reply.result.requests.length, 1); assert.ok(reply.result.pagination.total >= 3); assert.doesNotMatch(JSON.stringify(reply.result), /email|PERSON_NAME|avatar|password/);
});
for (const query of ['limit=101', 'page=0', 'status[$ne]=COMPLETED', 'status=invalid', 'sort=unknown', 'user=' + 'a'.repeat(24), 'status=REQUESTED&status=COMPLETED']) test('PRIV query-safe queue ' + query, async () => { await h.request('GET', '/admin/privacy/requests?' + query, null, adminCookie, 400); });
test('PRIV indexes ativos/latest/queue são justificados e request não possui PII direta', async () => {
    const Model = require('../backend/models/privacyRequestModel'); assert.equal(Model.schema.path('email'), undefined); assert.equal(Model.schema.path('name'), undefined); assert.equal(Model.schema.path('reason'), undefined);
    const indexes = await Model.collection.listIndexes().toArray(); assert.ok(indexes.some(index => index.name === 'one_active_privacy_request' && index.unique && index.partialFilterExpression.status === 'REQUESTED'));
});
