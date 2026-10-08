const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./authHarness');
let user, cookie;
before(h.start);
after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); user = await h.createUser(); cookie = await h.login(user); });
const collection = () => h.User.db.collection('authratelimits');
const badLogin = (email = user.email, headers) => h.request('POST', '/login', { email, password: 'invalid-test' }, null, undefined, headers);
async function failures(count = 5) {
    for (let i = 0; i < count; i++) assert.equal((await badLogin()).status, 401);
}
const limiter = options => require('../backend/services/authRateLimiter').createAuthRateLimiter(options);
const policies = () => require('../backend/config/authRateLimits');
async function recordFailure(service, identity) {
    const attempt = await service.beginLogin(identity);
    if (attempt.allowed) await attempt.finish(false);
    return attempt;
}

test('RL-01 login abaixo do limite mantém 401', async () => { await failures(3); });
test('RL-02 sexta tentativa da mesma conta/IP retorna 429', async () => {
    await failures(); assert.equal((await badLogin()).status, 429);
});
test('RL-03 resposta 429 é genérica e não revela conta, scope ou contador', async () => {
    await failures(); const reply = await badLogin();
    assert.equal(reply.status, 429);
    assert.deepEqual(reply.result, { success: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
});
test('RL-04 sucesso reseta conta e conta/IP; nova falha começa em um', async () => {
    await failures(2); await h.login(user); await failures(1);
    for (const scope of ['login:account', 'login:account-ip']) {
        const doc = await collection().findOne({ scope });
        assert.ok(doc, 'Contador ausente'); assert.equal(doc.count, 1); assert.equal(doc.pending, 0);
    }
});
test('RL-05 sucesso não limpa histórico de falhas do IP', async () => {
    await badLogin('missing-one@rate.example.test'); await badLogin('missing-two@rate.example.test');
    await h.login(user);
    const doc = await collection().findOne({ scope: 'login:ip' });
    assert.ok(doc, 'Contador IP ausente'); assert.equal(doc.count, 2); assert.equal(doc.pending, 0);
});
test('RL-06 conta inexistente recebe o mesmo limite', async () => {
    const email = 'missing@rate.example.test';
    for (let i = 0; i < 5; i++) assert.equal((await badLogin(email)).status, 401);
    assert.equal((await badLogin(email)).status, 429);
});
test('RL-07 distribuição entre contas alcança limite global do IP', async () => {
    for (let i = 0; i < 50; i++) assert.equal((await badLogin(`missing${i}@rate.example.test`)).status, 401);
    assert.equal((await badLogin('another@rate.example.test')).status, 429);
});
test('RL-08 IPs distintos atingem limite global da conta', async () => {
    const service = limiter();
    for (let i = 0; i < 20; i++) assert.equal((await recordFailure(service, { email: user.email, ip: `198.51.100.${i+1}` })).allowed, true);
    assert.equal((await service.beginLogin({ email: user.email, ip: '198.51.100.100' })).allowed, false);
    const doc = await collection().findOne({ scope: 'login:account' });
    assert.equal(doc.count, 20); assert.equal(doc.pending, 0);
});
test('RL-09 variar X-Forwarded-For não renova limite', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await badLogin(user.email, { 'X-Forwarded-For': `198.51.100.${i+1}` })).status, 401);
    assert.equal((await badLogin(user.email, { 'X-Forwarded-For': '203.0.113.200' })).status, 429);
    assert.equal(require('../backend/app').get('trust proxy'), false);
});
test('RL-10 quatro falhas e três tentativas simultâneas permitem só uma', async () => {
    await failures(4);
    const replies = await Promise.all(Array.from({ length: 3 }, () => badLogin()));
    assert.deepEqual(replies.map(reply => reply.status).sort(), [401, 429, 429]);
    const doc = await collection().findOne({ scope: 'login:account-ip' });
    assert.ok(doc, 'Contador ausente'); assert.equal(doc.count, 5); assert.equal(doc.pending, 0);
});
test('RL-11 429 inclui Retry-After positivo', async () => {
    await failures(); const reply = await badLogin();
    assert.equal(reply.status, 429);
    assert.ok(Number(reply.response.headers.get('retry-after')) > 0, 'Retry-After ausente/inválido');
});
test('RL-12 janela curta expira logicamente sem remoção TTL física', async () => {
    await h.clearRateLimits();
    let now = Date.now() + 60000;
    const configured = { ...policies(), login: policies().login.map(rule => ({ ...rule, windowMs: 100 })) };
    const service = limiter({ policies: configured, now: () => now });
    const identity = { email: user.email, ip: '198.51.100.1' };
    for (let i = 0; i < 5; i++) await recordFailure(service, identity);
    assert.equal((await service.beginLogin(identity)).allowed, false);
    now += 101;
    assert.equal(await collection().countDocuments({ scope: 'login:account-ip' }), 1);
    const attempt = await service.beginLogin(identity);
    assert.equal(attempt.allowed, true); await attempt.finish(false);
    const doc = await collection().findOne({ scope: 'login:account-ip' });
    assert.equal(doc.count, 1); assert.equal(doc.pending, 0);
});
test('RL-13 forgot abaixo do limite mantém controller e SMTP mockado', async () => {
    const before = h.mailCount(); await h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    assert.equal(h.mailCount(), before + 1);
});
test('RL-14 forgot bloqueado não envia SMTP nem substitui token', async () => {
    for (let i = 0; i < 5; i++) await h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    const saved = await h.User.findById(user.id), before = h.mailCount();
    await h.request('POST', '/password/forgot', { email: user.email }, null, 429);
    const current = await h.User.findById(user.id);
    assert.equal(h.mailCount(), before);
    assert.ok(saved.resetPasswordToken === current.resetPasswordToken, 'Token foi substituído após bloqueio');
    assert.equal(saved.resetPasswordExpire.getTime(), current.resetPasswordExpire.getTime());
});
test('RL-15 reset inválido alcança limite por IP antes do controller', async () => {
    for (let i = 0; i < 10; i++) await h.request('PUT', '/password/reset/invalid', { password: h.password, confirmPassword: h.password }, null, 400);
    await h.request('PUT', '/password/reset/another-invalid', { password: h.password, confirmPassword: h.password }, null, 429);
});
test('RL-16 cadastro bloqueado não cria conta adicional', async () => {
    for (let i = 0; i < 10; i++) await h.request('POST', '/register', { name: 'Cadastro limitado', email: `register${i}@rate.example.test`, password: h.password }, null, 201);
    const before = await h.User.countDocuments();
    await h.request('POST', '/register', { name: 'Cadastro bloqueado', email: 'blocked@rate.example.test', password: h.password }, null, 429);
    assert.equal(await h.User.countDocuments(), before);
});
test('RL-17 conexões e serviços independentes compartilham storage', async () => {
    const Model = require('../backend/models/authRateLimitModel');
    const { createMongoRateLimitStore } = require('../backend/services/mongoAuthRateLimitStore');
    const connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${h.database}`).asPromise();
    try {
        const otherModel = connection.model('AuthRateLimit', Model.schema);
        await otherModel.init();
        const a = limiter({ store: createMongoRateLimitStore(Model) });
        const b = limiter({ store: createMongoRateLimitStore(otherModel) });
        const identity = { email: user.email, ip: '198.51.100.5' };
        for (let i = 0; i < 3; i++) assert.equal((await recordFailure(a, identity)).allowed, true);
        for (let i = 0; i < 2; i++) assert.equal((await recordFailure(b, identity)).allowed, true);
        assert.equal((await b.beginLogin(identity)).allowed, false);
        assert.equal((await a.beginLogin(identity)).allowed, false);
    } finally { await connection.close(); }
});
test('RL-18 chave única, expiresAt e TTL estão presentes', async () => {
    await failures(1);
    const indexes = await collection().indexes();
    assert.ok(indexes.some(index => index.key._id === 1), 'Índice da chave ausente');
    assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0), 'TTL ausente');
    const doc = await collection().findOne({ scope: 'login:ip' });
    assert.ok(doc.expiresAt instanceof Date); assert.ok(doc.windowStartedAt instanceof Date);
});
test('RL-19 bloqueio de login não interfere no logout nem na revogação F006', async () => {
    await failures(); await h.request('POST', '/logout', null, cookie, 200);
    await h.request('GET', '/me', null, cookie, 401);
});
test('RL-20 troca de senha continua revogando JWT antigo', async () => {
    const nextPassword = 'RateLimitSession123!';
    const reply = await h.request('PUT', '/password/update', { oldPassword: h.password, newPassword: nextPassword, confirmPassword: nextPassword }, cookie, 200);
    await h.request('GET', '/me', null, cookie, 401); await h.request('GET', '/me', null, h.cookieOf(reply), 200);
});
test('RL-21 reset mantém revogação JWT e single-use', async () => {
    const token = await h.recoveryToken(user);
    const payload = { password: h.password, confirmPassword: h.password };
    const reply = await h.request('PUT', '/password/reset/' + token, payload, null, 200);
    await h.request('GET', '/me', null, cookie, 401); await h.request('GET', '/me', null, h.cookieOf(reply), 200);
    await h.request('PUT', '/password/reset/' + token, payload, null, 400);
});
test('RL-22 bloqueio acontece antes da consulta de senha e bcrypt', async () => {
    await failures();
    const find = h.User.findOne, compare = h.User.prototype.comparePassword;
    let reads = 0, comparisons = 0;
    h.User.findOne = function (...args) { reads++; return find.apply(this, args); };
    h.User.prototype.comparePassword = function (...args) { comparisons++; return compare.apply(this, args); };
    try { assert.equal((await badLogin()).status, 429); assert.equal(reads, 0); assert.equal(comparisons, 0); }
    finally { h.User.findOne = find; h.User.prototype.comparePassword = compare; }
});
test('RL-23 scopes de login, recuperação, cadastro e reset são independentes', async () => {
    await failures(); assert.equal((await badLogin()).status, 429);
    await h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    await h.request('POST', '/register', { name: 'Conta independente', email: 'independent@rate.example.test', password: h.password }, null, 201);
    await h.request('PUT', '/password/reset/invalid', { password: h.password, confirmPassword: h.password }, null, 400);
});
test('RL-24 trim/lowercase usam a mesma chave de conta', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await badLogin(i % 2 ? `  ${user.email.toUpperCase()}  ` : user.email)).status, 401);
    assert.equal((await badLogin(user.email.toUpperCase())).status, 429);
    assert.equal(await collection().countDocuments({ scope: 'login:account' }), 1);
});
test('RL-25 storage não contém e-mail, IP puro, senha, JWT ou token de recuperação', async () => {
    await failures(1); await h.recoveryToken(user);
    const docs = await collection().find({}).toArray();
    assert.ok(docs.length > 0, 'Nenhum registro do limiter');
    const allowed = ['_id', 'scope', 'count', 'pending', 'windowStartedAt', 'expiresAt'];
    for (const doc of docs) {
        assert.ok(Object.keys(doc).every(key => allowed.includes(key)), 'Campo não previsto no storage');
        assert.ok(typeof doc._id === 'string' && /^[a-f0-9]{64}$/.test(doc._id), 'Chave não derivada');
    }
    const serialized = JSON.stringify(docs);
    assert.ok(!serialized.includes(user.email) && !serialized.includes('127.0.0.1') && !serialized.includes(h.password), 'Dado puro persistido');
});
test('RL-26 falha do storage responde 503 sem fallback ou bcrypt', async () => {
    const Model = require('../backend/models/authRateLimitModel');
    const original = Model.collection.findOneAndUpdate, compare = h.User.prototype.comparePassword;
    let comparisons = 0;
    Model.collection.findOneAndUpdate = async () => { throw new Error('Storage de teste indisponível'); };
    h.User.prototype.comparePassword = function (...args) { comparisons++; return compare.apply(this, args); };
    try { const reply = await badLogin(); assert.equal(reply.status, 503); assert.equal(comparisons, 0); assert.equal(reply.result.success, false); }
    finally { Model.collection.findOneAndUpdate = original; h.User.prototype.comparePassword = compare; }
});
test('RL-27 concorrência na primeira criação mantém chave única e teto', async () => {
    await h.clearRateLimits();
    const replies = await Promise.all(Array.from({ length: 12 }, () => badLogin()));
    assert.equal(replies.filter(reply => reply.status === 401).length, 5);
    assert.equal(replies.filter(reply => reply.status === 429).length, 7);
    assert.equal(await collection().countDocuments(), 3);
    const docs = await collection().find({}).toArray();
    assert.ok(docs.every(doc => doc.count === 5 && doc.pending === 0), 'Contagem inconsistente');
});
test('RL-28 reservas abandonadas expiram e conclusão antiga não altera janela nova', async () => {
    await h.clearRateLimits();
    let now = Date.now() + 60000;
    const configured = { ...policies(), login: policies().login.map(rule => ({ ...rule, windowMs: 100 })) };
    const service = limiter({ policies: configured, now: () => now });
    const identity = { email: user.email, ip: '198.51.100.8' }, attempts = [];
    for (let i = 0; i < 5; i++) attempts.push(await service.beginLogin(identity));
    assert.equal((await service.beginLogin(identity)).allowed, false);
    now += 101;
    const current = await service.beginLogin(identity); assert.equal(current.allowed, true);
    await attempts[0].finish(false);
    const doc = await collection().findOne({ scope: 'login:account-ip' });
    assert.equal(doc.count, 0); assert.equal(doc.pending, 1);
    await current.finish(false);
});

test('RL-29 forgot limita IP mesmo distribuindo entre contas inexistentes', async () => {
    for (let i = 0; i < 10; i++) await h.request('POST', '/password/forgot', { email: `missing${i}@forgot.example.test` }, null, 200);
    await h.request('POST', '/password/forgot', { email: 'another@forgot.example.test' }, null, 429);
});
test('RL-30 falha ao adquirir segundo scope libera reserva anterior', async () => {
    await h.clearRateLimits();
    const { createMongoRateLimitStore } = require('../backend/services/mongoAuthRateLimitStore');
    const store = createMongoRateLimitStore(); let calls = 0;
    const service = limiter({ store: { ...store, acquire: (...args) => {
        if (++calls === 2) throw new Error('Falha controlada do store');
        return store.acquire(...args);
    } } });
    await assert.rejects(service.beginLogin({ email: user.email, ip: '198.51.100.40' }), error => error.statusCode === 503);
    const doc = await collection().findOne({ scope: 'login:ip' });
    assert.equal(doc.pending, 0); assert.equal(doc.count, 0);
});
test('RL-31 falha na conclusão do limiter não emite cookie ou JWT', async () => {
    const Model = require('../backend/models/authRateLimitModel');
    const original = Model.collection.updateOne;
    Model.collection.updateOne = async () => { throw new Error('Falha controlada de conclusão'); };
    try {
        const reply = await h.request('POST', '/login', { email: user.email, password: h.password }, null, 503);
        assert.ok(reply.result.token === undefined, 'JWT emitido em falha de storage');
        assert.equal(reply.response.headers.has('set-cookie'), false);
    } finally { Model.collection.updateOne = original; }
});
test('RL-32 consulta principal utiliza chave indexada sem collection scan', async () => {
    await failures(1); const doc = await collection().findOne({ scope: 'login:ip' });
    const explain = await collection().find({ _id: doc._id }).explain('executionStats');
    assert.equal(explain.executionStats.totalDocsExamined, 1);
    assert.equal(explain.executionStats.totalKeysExamined, 1);
    assert.ok(!JSON.stringify(explain.queryPlanner.winningPlan).includes('COLLSCAN'));
});
test('RL-33 conclusão repetida da mesma tentativa não incrementa novamente', async () => {
    const service = limiter(), identity = { email: user.email, ip: '198.51.100.41' };
    const attempt = await service.beginLogin(identity);
    await attempt.finish(false); await attempt.finish(false);
    const doc = await collection().findOne({ scope: 'login:account' });
    assert.equal(doc.count, 1); assert.equal(doc.pending, 0);
});
test('RL-34 falha parcial na liberação não libera reserva de outra requisição', async () => {
    await h.clearRateLimits();
    const { createMongoRateLimitStore } = require('../backend/services/mongoAuthRateLimitStore');
    const store = createMongoRateLimitStore(), service = limiter({ store });
    const identity = { email: user.email, ip: '198.51.100.42' };
    for (let i = 0; i < 5; i++) await recordFailure(service, identity);
    const other = await service.beginLogin({ email: 'other@rate.example.test', ip: identity.ip });
    let ipSettlements = 0;
    const failing = limiter({ store: { ...store, settle: (entry, ...args) => {
        if (entry.dimension === 'account') throw new Error('Falha parcial controlada');
        ipSettlements++; return store.settle(entry, ...args);
    } } });
    await assert.rejects(failing.beginLogin(identity), error => error.statusCode === 503);
    assert.equal(ipSettlements, 1);
    const doc = await collection().findOne({ scope: 'login:ip' });
    assert.equal(doc.pending, 1);
    await other.finish(false);
});

test('RL-35 formato alternativo de e-mail aceito pelo controller não cria chave nova', async () => {
    await failures();
    assert.equal((await badLogin([user.email])).status, 429);
    assert.equal(await collection().countDocuments({ scope: 'login:account' }), 1);
});
