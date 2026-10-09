const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { start, capture } = require('./helpers/observabilityHarness');
const lifecycle = require('../backend/utils/userLifecycle');
let instance, h, admin, user, adminCookie, cookie;
before(async () => { instance = await start(); h = instance.h; });
after(async () => { await instance?.stop(); });
beforeEach(async () => {
    await h.clearRateLimits();
    admin = await h.createUser('admin'); user = await h.createUser();
    adminCookie = await h.login(admin); cookie = await h.login(user);
});
const change = (action = 'deactivate', target = user, session = adminCookie, expected = 200, body = {}) =>
    h.request('PATCH', '/admin/user/' + target.id + '/' + action, body, session, expected === null ? undefined : expected);
const saved = () => h.User.findById(user.id);
const Audit = () => require('../backend/models/adminAuditEventModel');
const events = action => Audit().find({ targetId: user._id, ...(action ? { action } : {}) }).lean();
const list = status => h.request('GET', '/admin/users' + (status === undefined ? '' : '?status=' + status), null, adminCookie, 200);
function privateReply(reply) {
    assert.match(reply.response.headers.get('cache-control'), /no-store/);
    assert.match(reply.response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
    assert.equal(reply.response.headers.has('set-cookie'), false);
    assert.doesNotMatch(JSON.stringify(reply.result), /"(?:jwt|token|accessToken)"/);
}
test('UL-01 novo User persistido ACTIVE com metadata nula', async () => {
    const row = await h.User.db.db.collection('users').findOne({ _id: user._id });
    assert.equal(row.accountStatus, 'ACTIVE'); assert.equal(row.deactivatedAt, null); assert.equal(row.deactivatedBy, null);
});
test('UL-02 legacy missing autentica/lista ACTIVE sem escrever migration', async () => {
    await h.User.updateOne({ _id: user._id }, { $unset: { accountStatus: '' } });
    await h.request('GET', '/me', null, cookie, 200);
    assert.ok((await list()).result.users.some(row => row._id === user.id && row.accountStatus === 'ACTIVE'));
    assert.equal((await h.User.db.db.collection('users').findOne({ _id: user._id })).accountStatus, undefined);
});
test('UL-03 DELETE legado retorna 405 Allow PATCH sem desativar', async () => {
    const reply = await h.request('DELETE', '/admin/user/' + user.id, null, adminCookie, 405);
    assert.equal(reply.response.headers.get('allow'), 'PATCH'); privateReply(reply);
    assert.equal((await saved()).accountStatus, 'ACTIVE'); assert.equal((await events()).length, 0);
});
test('UL-09 desativação altera estado/metadata/versão e respeita body controlado no servidor', async () => {
    const reply = await change('deactivate', user, adminCookie, 200, { accountStatus: 'ACTIVE', deactivatedBy: user.id, tokenVersion: 999 });
    const row = await saved(); assert.equal(row.accountStatus, 'DEACTIVATED'); assert.equal(row.tokenVersion, 1);
    assert.ok(row.deactivatedAt instanceof Date); assert.equal(String(row.deactivatedBy), admin.id); privateReply(reply);
});
test('UL-10 segunda desativação mantém timestamp/actor/versão e um evento', async () => {
    await change(); const first = await saved(); const other = await h.createUser('admin');
    await change('deactivate', user, await h.login(other)); const second = await saved();
    assert.equal(second.deactivatedAt.getTime(), first.deactivatedAt.getTime()); assert.equal(String(second.deactivatedBy), admin.id);
    assert.equal(second.tokenVersion, 1); assert.equal((await events('USER_DEACTIVATED')).length, 1);
});
test('UL-11 reativação mantém versão, limpa metadata e não emite sessão', async () => {
    await change(); const reply = await change('reactivate'); privateReply(reply); const row = await saved();
    assert.equal(row.accountStatus, 'ACTIVE'); assert.equal(row.deactivatedAt, null); assert.equal(row.deactivatedBy, null); assert.equal(row.tokenVersion, 1);
});
test('UL-12 reativação idempotente não cria evento nem incrementa versão', async () => {
    await change('reactivate'); assert.equal((await saved()).tokenVersion, 0); assert.equal((await events()).length, 0);
    await change(); await change('reactivate'); await change('reactivate'); assert.equal((await events('USER_REACTIVATED')).length, 1);
});
test('UL-13/14 ciclos múltiplos mantêm invariantes e versões crescentes', async () => {
    for (let i = 1; i <= 3; i++) { await change(); const row = await saved(); assert.equal(row.tokenVersion, i); assert.ok(row.deactivatedAt); assert.equal(String(row.deactivatedBy), admin.id); await change('reactivate'); assert.equal((await saved()).deactivatedAt, null); }
});
test('UL-15 auto-desativação administrativa é proibida', async () => { await change('deactivate', admin, adminCookie, 403); assert.equal((await h.User.findById(admin.id)).accountStatus, 'ACTIVE'); });
for (const action of ['deactivate', 'reactivate']) {
    test('UL-16 user não pode ' + action, async () => { await change(action, admin, cookie, 403); });
    test('UL-17 visitante não pode ' + action, async () => { await change(action, user, null, 401); });
    test('UL-18 CSRF inválido bloqueia ' + action + ' sem modificar estado', async () => {
        const reply = await h.request('PATCH', '/admin/user/' + user.id + '/' + action, {}, adminCookie, 403, { 'X-Fetech-CSRF': 'bad' });
        assert.equal((await saved()).accountStatus, 'ACTIVE'); assert.equal((await events()).length, 0); privateReply(reply);
    });
    test('UL rota ' + action + ' rejeita ID inválido e inexistente', async () => {
        await h.request('PATCH', '/admin/user/invalid/' + action, {}, adminCookie, 400);
        await h.request('PATCH', '/admin/user/' + new mongoose.Types.ObjectId() + '/' + action, {}, adminCookie, 404);
    });
}
async function onlyActiveAdmin() {
    await require('./helpers/userFixtureCleanup')(h.User);
    admin = await h.createUser('admin'); adminCookie = await h.login(admin);
    const inactive = await h.createUser('admin'); await change('deactivate', inactive);
    return inactive;
}
test('UL-19/20 último admin ACTIVE não pode ser desativado, inativos não contam', async () => {
    await onlyActiveAdmin(); const service = require('../backend/services/adminSafetyService');
    await assert.rejects(service.ensureAnotherAdmin(h.User), error => error.statusCode === 409);
    // Target last admin from a different operational executor cannot exist. Direct
    // invariant testing avoids masking 409 with the required self-action 403.
    assert.equal(await h.User.countDocuments({ role: 'admin', ...lifecycle.activeFilter() }), 1);
});
test('UL-21 demotion considera somente admins ativos', async () => {
    const inactive = await onlyActiveAdmin(); await h.User.updateOne({ _id: inactive._id }, { role: 'user' });
    await assert.rejects(require('../backend/services/adminSafetyService').ensureAnotherAdmin(h.User), error => error.statusCode === 409);
    await h.request('PUT', '/admin/user/' + admin.id, { role: 'user' }, adminCookie, 403);
});
for (const mixed of [false, true]) test('UL-22/23 concorrência ' + (mixed ? 'deactivate + demote' : 'deactivate + deactivate'), async () => {
    await require('./helpers/userFixtureCleanup')(h.User); const a = await h.createUser('admin'), b = await h.createUser('admin');
    const ca = await h.login(a), cb = await h.login(b);
    const replies = await Promise.all([change('deactivate', b, ca, null), mixed ? h.request('PUT', '/admin/user/' + a.id, { role: 'user' }, cb) : change('deactivate', a, cb, null)]);
    assert.equal(replies.filter(reply => reply.status === 200).length, 1);
    assert.ok(replies.every(reply => [200, 401, 403, 409].includes(reply.status)));
    assert.equal(await h.User.countDocuments({ role: 'admin', ...lifecycle.activeFilter() }), 1);
});
test('UL-24 bootstrap com zero ativos cria novo admin sem reativar o antigo', async () => {
    await require('./helpers/userFixtureCleanup')(h.User); const old = await h.createUser('admin');
    await h.User.updateOne({ _id: old._id }, { accountStatus: 'DEACTIVATED', deactivatedAt: new Date(), deactivatedBy: old._id });
    const service = require('../backend/services/adminSafetyService').createAdminSafetyService();
    const next = await service.bootstrap({ name: 'Administrador novo', email: 'bootstrap_lifecycle@example.test', password: h.password, confirmPassword: h.password });
    assert.equal(next.accountStatus, 'ACTIVE'); assert.equal((await h.User.findById(old.id)).accountStatus, 'DEACTIVATED');
    await assert.rejects(service.bootstrap({ name: 'Administrador novo', email: 'another@example.test', password: h.password, confirmPassword: h.password }), error => error.statusCode === 409);
});
test('UL-25 CLI com somente admin desativado exige confirmação e cria conta nova com senha oculta', async () => {
    await require('./helpers/userFixtureCleanup')(h.User); const old = await h.createUser('admin');
    await h.User.updateOne({ _id: old._id }, { accountStatus: 'DEACTIVATED', deactivatedAt: new Date(), deactivatedBy: old._id });
    const { runBootstrapCli } = require('../backend/scripts/bootstrapAdmin'), lines = [], hidden = [];
    let preparations = 0;
    const refused = await runBootstrapCli({ connection: h.User.db, prompt: async () => 'wrong', prepare: async () => { preparations++; }, write: line => lines.push(line) });
    assert.equal(refused, 1); assert.equal(preparations, 0);
    const values = [h.database, 'Administrador CLI', 'cli-lifecycle@example.test', h.password, h.password];
    const accepted = await runBootstrapCli({ connection: h.User.db, prompt: async (label, secret) => { hidden.push(Boolean(secret)); return values.shift(); }, prepare: async () => { preparations++; }, write: line => lines.push(line) });
    assert.equal(accepted, 0); assert.equal(preparations, 1); assert.deepEqual(hidden, [false, false, false, true, true]);
    assert.ok(lines.includes('Administradores ativos: 0')); assert.equal(lines.join('').includes(h.password), false);
    assert.equal((await h.User.findById(old.id)).accountStatus, 'DEACTIVATED');
    const created = await h.User.findOne({ email: 'cli-lifecycle@example.test' }); assert.equal(created.accountStatus, 'ACTIVE'); await h.login(created);
});
test('UL-26/27 cookie anterior revogado e incremento único', async () => { await change(); await change(); await h.request('GET', '/me', null, cookie, 401); assert.equal((await saved()).tokenVersion, 1); });
test('UL-28 JWT fabricado com versão atual também bloqueado por status', async () => { await change(); await h.request('GET', '/me', null, h.signedCookie(user, { tokenVersion: 1 }), 401); });
test('UL-29/30 login de conta desativada usa erro genérico e não emite cookie', async () => {
    await change(); const first = await h.request('POST', '/login', { email: user.email, password: h.password }, null, 401);
    const second = await h.request('POST', '/login', { email: 'missing@example.test', password: h.password }, null, 401);
    assert.deepEqual(first.result, second.result); privateReply(first);
});
test('UL-31 login desativado continua contando falhas no limiter', async () => {
    await change(); for (let i = 0; i < 5; i++) await h.request('POST', '/login', { email: user.email, password: h.password }, null, 401);
    const reply = await h.request('POST', '/login', { email: user.email, password: h.password }, null, 429); assert.ok(Number(reply.response.headers.get('retry-after')) > 0);
});
test('UL-32/33/34 forgot desativado uniforme com timing floor e sem token/email', async () => {
    await change(); const mails = h.mailCount(), started = performance.now();
    const reply = await h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    assert.ok(performance.now() - started >= 18); assert.equal(h.mailCount(), mails);
    assert.deepEqual(reply.result, (await h.request('POST', '/password/forgot', { email: 'missing@example.test' }, null, 200)).result);
    assert.equal((await saved()).resetPasswordToken, undefined); privateReply(reply);
});
test('UL-35/36/37 reset anterior invalidado, nunca reativa ou emite cookie', async () => {
    const token = await h.recoveryToken(user); await change(); const row = await saved();
    assert.equal(row.resetPasswordToken, undefined); assert.equal(row.resetPasswordExpire, undefined);
    const reply = await h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password, accountStatus: 'ACTIVE' }, null, 400);
    privateReply(reply); assert.equal((await saved()).accountStatus, 'DEACTIVATED');
});
test('UL reset de conta inativa com token raw existente também é bloqueado', async () => {
    const token = await h.recoveryToken(user), hash = crypto.createHash('sha256').update(token).digest('hex'); await change();
    await h.User.updateOne({ _id: user._id }, { resetPasswordToken: hash, resetPasswordExpire: new Date(Date.now() + 60000) });
    await h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password }, null, 400);
    assert.equal((await saved()).accountStatus, 'DEACTIVATED');
});
test('UL-38/39/40 reativado aceita novo login sem restaurar JWT anterior', async () => {
    await change(); await change('reactivate'); await h.request('GET', '/me', null, cookie, 401);
    const current = await h.login(user); await h.request('GET', '/me', null, current, 200);
    assert.equal(h.jwt.verify(current.slice(6), process.env.JWT_SECRET).tokenVersion, 1);
});
test('UL-41 email da conta desativada continua reservado', async () => {
    await change(); const reply = await h.request('POST', '/register', { name: 'Conta duplicada', email: user.email, password: h.password }, null, 400);
    assert.equal(await h.User.countDocuments({ email: user.email }), 1); privateReply(reply);
});
async function references() {
    const { productData } = require('./fixtures'), Product = require('../backend/models/productModel');
    const product = await Product.create(productData({ user: admin._id }));
    await h.request('PUT', '/review', { productId: product.id, rating: 4, comment: 'Fixture review' }, cookie, 200);
    const shippingInfo = { recipientName: 'Cliente Fixture', number: '1', complement: '', neighborhood: 'Centro', address: 'Rua Fixture', city: 'Maringá', state: 'PR', country: 'Brasil', pinCode: '87000000', phoneNo: '44999999999' };
    await require('../backend/models/addressModel').init();
    const address = await h.request('POST', '/address/new', { label: 'Casa', ...shippingInfo }, cookie, 201);
    const order = await h.request('POST', '/order/new', { shippingInfo, orderItems: [{ product: product.id, quantity: 2 }] }, cookie, 201, { 'Idempotency-Key': crypto.randomUUID() });
    await h.request('PATCH', '/admin/order/' + order.result.order._id + '/archive', {}, adminCookie, 200);
    const ids = { product: product._id, order: new mongoose.Types.ObjectId(order.result.order._id), address: new mongoose.Types.ObjectId(address.result.address._id) };
    const raw = async () => ({
        address: await mongoose.connection.db.collection('addresses').findOne({ _id: ids.address }),
        order: await mongoose.connection.db.collection('orders').findOne({ _id: ids.order }),
        product: await mongoose.connection.db.collection('products').findOne({ _id: ids.product }),
        claims: await mongoose.connection.db.collection('orderidempotencies').find({ user: user._id }).toArray(),
        movements: await mongoose.connection.db.collection('stockmovements').find({ order: ids.order }).toArray(),
        audits: await mongoose.connection.db.collection('adminauditevents').find({ targetId: ids.order }).toArray(),
    });
    return { ids, raw };
}
for (const field of ['address', 'order', 'product', 'claims', 'movements', 'audits']) test('UL referências ' + field + ' intactas após DELETE/desativar/reativar', async () => {
    const fixture = await references(), before = await fixture.raw();
    await h.request('DELETE', '/admin/user/' + user.id, null, adminCookie, 405); assert.deepEqual((await fixture.raw())[field], before[field]);
    await change(); assert.deepEqual((await fixture.raw())[field], before[field]);
    await change('reactivate'); assert.deepEqual((await fixture.raw())[field], before[field]);
    assert.ok(await h.User.exists({ _id: before.order.user })); assert.ok(await h.User.exists({ _id: before.product.reviews[0].user }));
});
test('UL-55/56 admin histórico desativado mantém Audit.actor e archivedBy resolvidos', async () => {
    const fixture = await references(), before = await fixture.raw(), other = await h.createUser('admin');
    await change('deactivate', admin, await h.login(other)); const after = await fixture.raw();
    assert.deepEqual(after.audits, before.audits); assert.equal(String(after.order.administrativeArchivedBy), admin.id);
    assert.ok(await h.User.exists({ _id: after.audits[0].actorUserId })); assert.ok(await h.User.exists({ _id: after.order.administrativeArchivedBy }));
});
for (const [action, event, from, to] of [['deactivate', 'USER_DEACTIVATED', 'ACTIVE', 'DEACTIVATED'], ['reactivate', 'USER_REACTIVATED', 'DEACTIVATED', 'ACTIVE']]) {
    test('UL-57/58/59/60 auditoria ' + event + ' correlacionada sem PII', async () => {
        if (action === 'reactivate') await change(); const { result: reply, logs } = await capture(async () => {
            h.configure({ LOG_LEVEL: 'info' }); try { return await change(action); } finally { h.configure(); }
        });
        const [row] = await events(event); assert.equal(row.requestId, reply.response.headers.get('x-request-id'));
        assert.equal(String(row.actorUserId), admin.id); assert.equal(row.actorRole, 'admin'); assert.equal(row.targetType, 'USER');
        assert.deepEqual(row.metadata, { fromStatus: from, toStatus: to });
        assert.ok(logs.some(log => log.event === 'admin.action.completed' && log.action === event));
        assert.doesNotMatch(JSON.stringify([row, logs]), new RegExp(user.email + '|' + h.password + '|Cliente de sessão|resetPassword'));
    });
    test('UL-62 falha de auditoria reverte ' + action + ' integralmente', async () => {
        if (action === 'reactivate') await change(); const before = (await saved()).toObject(), count = (await events()).length;
        const original = Audit().create; Audit().create = async () => { throw new Error('PRIVATE_FAILURE'); };
        try { await capture(() => change(action, user, adminCookie, 500)); } finally { Audit().create = original; }
        const after = (await saved()).toObject(); assert.deepEqual(after, before); assert.equal((await events()).length, count);
    });
}
test('UL-61 operação proibida não cria evento de sucesso', async () => {
    const count = await Audit().countDocuments(); await change('deactivate', admin, adminCookie, 403); await change('deactivate', user, cookie, 403); assert.equal(await Audit().countDocuments(), count);
});
for (const status of ['active', 'deactivated', 'all', undefined]) test('UL-63/64/65 filtro ' + (status ?? 'default ativo'), async () => {
    await change(); const reply = await list(status); privateReply(reply);
    assert.equal(reply.result.users.some(row => row._id === user.id), status === 'deactivated' || status === 'all');
    if (status === 'active' || status === undefined) assert.ok(reply.result.users.every(row => row.accountStatus === 'ACTIVE'));
    if (status === 'deactivated') assert.ok(reply.result.users.every(row => row.accountStatus === 'DEACTIVATED'));
});
for (const status of ['banana', 'ACTIVE', '', 'active&status=all', 'active&status[x]=all']) test('UL-66 rejeita filtro ' + status, async () => { await h.request('GET', '/admin/users?status=' + status, null, adminCookie, 400); });
test('UL-67 detalhe administrativo de conta desativada inclui metadata técnica segura', async () => {
    await change(); const reply = await h.request('GET', '/admin/user/' + user.id, null, adminCookie, 200); privateReply(reply);
    assert.equal(reply.result.user.accountStatus, 'DEACTIVATED'); assert.equal(reply.result.user.deactivatedBy, admin.id); assert.ok(reply.result.user.deactivatedAt);
    assert.equal('password' in reply.result.user, false);
});
test('UL-68 serializers públicos não vazam deactivatedBy/at/fence/password', async () => {
    await change(); for (const result of [(await saved()).toJSON(), lifecycle.publicUser(await saved())]) {
        for (const field of ['deactivatedBy', 'deactivatedAt', 'adminMutationFence', 'password', 'resetPasswordToken']) assert.equal(field in result, false);
    }
    await change('reactivate'); const reply = await h.request('POST', '/login', { email: user.email, password: h.password }, null, 200);
    assert.equal('deactivatedBy' in reply.result.user, false); assert.equal('deactivatedAt' in reply.result.user, false);
});
for (const method of ['findOneAndDelete', 'findByIdAndDelete', 'deleteOne', 'deleteMany', 'document.deleteOne', 'collection.deleteOne', 'collection.deleteMany', 'bulkWrite', 'bulkWrite.skipMiddleware', 'replaceOne', 'findOneAndReplace', 'aggregate.$out']) test('UL-69/70/71/72 guarda física ' + method, async () => {
    let operation;
    if (method === 'document.deleteOne') operation = () => user.deleteOne();
    else if (method === 'bulkWrite' || method === 'bulkWrite.skipMiddleware') operation = () => h.User.bulkWrite([{ deleteOne: { filter: { _id: user._id } } }], { skipMiddleware: method.endsWith('skipMiddleware') });
    else if (method === 'aggregate.$out') operation = () => h.User.aggregate([{ $match: {} }, { $out: 'user_copy' }]);
    else if (method.startsWith('collection.')) operation = () => h.User.collection[method.split('.')[1]]({ _id: user._id });
    else if (method === 'findByIdAndDelete') operation = () => h.User[method](user.id);
    else operation = () => h.User[method]({ _id: user._id }, { name: 'Replacement' });
    await assert.rejects(operation, error => error.code === 'USER_PHYSICAL_DELETE_FORBIDDEN'); assert.ok(await h.User.exists({ _id: user._id }));
});

test('UL cadastro/perfil/admin update ignoram injeção de lifecycle', async () => {
    const body = { accountStatus: 'DEACTIVATED', deactivatedAt: new Date().toISOString(), deactivatedBy: admin.id };
    await h.request('PUT', '/me/update', { ...body, name: user.name, email: user.email }, cookie, 200);
    await h.request('PUT', '/admin/user/' + user.id, body, adminCookie, 200); assert.equal((await saved()).accountStatus, 'ACTIVE');
    const reply = await h.request('POST', '/register', { ...body, name: 'Conta normal', email: crypto.randomUUID() + '@fixture.test', password: h.password }, null, 201);
    assert.equal(reply.result.user.accountStatus, 'ACTIVE');
});
for (const status of [null, 'UNKNOWN']) test('UL status inválido ' + status + ' falha fechado em auth/login/recovery', async () => {
    await h.User.db.db.collection('users').updateOne({ _id: user._id }, { $set: { accountStatus: status } });
    await h.request('GET', '/me', null, cookie, 401); await h.request('POST', '/login', { email: user.email, password: h.password }, null, 401);
    const mails = h.mailCount(); await h.request('POST', '/password/forgot', { email: user.email }, null, 200); assert.equal(h.mailCount(), mails);
});
test('UL save de senha atrasado não reabre conta desativada', async () => {
    const stale = await h.User.findById(user.id).select('+password'); stale.password = 'ChangedFixture123!'; await change();
    await assert.rejects(require('../backend/utils/authSession').saveWithRevokedSessions(stale), error => error.statusCode === 401);
    const row = await h.User.findById(user.id).select('+password'); assert.equal(row.accountStatus, 'DEACTIVATED'); assert.equal(await row.comparePassword(h.password), true); assert.equal(row.tokenVersion, 1);
});
test('UL forgot pausado antes de save não recria token após desativação', async () => {
    const original = h.User.prototype.save; let release, ready;
    const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { ready = resolve; });
    h.User.prototype.save = async function (...args) { if (this.id === user.id && this.resetPasswordToken) { ready(); await gate; } return original.apply(this, args); };
    const mails = h.mailCount(), request = h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    try { await waiting; await change(); release(); await request; assert.equal(h.mailCount(), mails); assert.equal((await saved()).resetPasswordToken, undefined); }
    finally { release(); h.User.prototype.save = original; await request; }
});
test('UL desativações concorrentes idempotentes geram uma revogação/evento', async () => {
    await Promise.all([change(), change()]); assert.equal((await saved()).tokenVersion, 1); assert.equal((await events('USER_DEACTIVATED')).length, 1);
});
test('UL-73 dropDatabase isolado funciona sem bypass de exclusão do model', async () => {
    const name = `fetech_lifecycle_drop_${process.pid}_${Date.now()}`;
    const connection = await mongoose.createConnection(require('./replicaSetHarness').testUri(name)).asPromise();
    try {
        const User = connection.model('User', h.User.schema);
        const row = await User.create({ name: 'Fixture teardown', email: 'drop@fixture.test', password: h.password, avatar: { public_id: 'fixture', url: '/Profile.png' } });
        await assert.rejects(User.deleteOne({ _id: row._id }), error => error.code === 'USER_PHYSICAL_DELETE_FORBIDDEN');
        assert.equal(connection.name, name); await connection.dropDatabase(); assert.equal(await User.countDocuments(), 0);
    } finally { await connection.close(); }
});
test('UL reset pausado durante bcrypt perde CAS após desativação', async () => {
    const token = await h.recoveryToken(user), original = h.User.prototype.save; let release, ready;
    const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { ready = resolve; });
    h.User.prototype.save = async function (...args) { if (this.id === user.id && this.isModified('password')) { ready(); await gate; } return original.apply(this, args); };
    const request = h.request('PUT', '/password/reset/' + token, { password: 'ChangedFixture123!', confirmPassword: 'ChangedFixture123!' }, null, 401);
    try { await waiting; await change(); release(); privateReply(await request); const row = await saved(); assert.equal(row.accountStatus, 'DEACTIVATED'); assert.equal(row.resetPasswordToken, undefined); assert.equal(row.tokenVersion, 1); }
    finally { release(); h.User.prototype.save = original; await request; }
});
test('UL login pausado ao comparar senha não emite cookie após desativação', async () => {
    const original = h.User.prototype.comparePassword; let release, ready;
    const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { ready = resolve; });
    h.User.prototype.comparePassword = async function (...args) { if (this.id === user.id) { ready(); await gate; } return original.apply(this, args); };
    const request = h.request('POST', '/login', { email: user.email, password: h.password }, null, 401);
    try { await waiting; await change(); release(); privateReply(await request); }
    finally { release(); h.User.prototype.comparePassword = original; await request; }
});
