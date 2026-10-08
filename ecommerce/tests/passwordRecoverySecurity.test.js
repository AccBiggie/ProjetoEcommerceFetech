const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
process.env.AUTH_FORGOT_MIN_RESPONSE_MS = '20';
const h = require('./authHarness');
const generic = { success: true, message: 'Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha.' };
let user;
before(h.start); after(h.stop);
beforeEach(async () => { h.setTransportFailure(false); await h.clearRateLimits(); user = await h.createUser(); });
const forgot = email => h.request('POST', '/password/forgot', { email });
const saved = () => h.User.findById(user.id);
function uniform(reply) { assert.equal(reply.status, 200); assert.deepEqual(reply.result, generic); }
const reset = token => h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password });
test('PR-01 existente recebe 200 genérico', async () => uniform(await forgot(user.email)));
test('PR-02 inexistente recebe 200 genérico', async () => uniform(await forgot('missing@recovery.example.test')));
test('PR-03 status, body e headers públicos equivalentes', async () => {
    const a = await forgot(user.email), b = await forgot('missing@recovery.example.test');
    uniform(a); uniform(b);
    for (const name of ['content-type', 'content-length', 'etag', 'set-cookie', 'cache-control', 'retry-after']) {
        assert.ok(a.response.headers.get(name) === b.response.headers.get(name), 'Header público diferente');
    }
});
test('PR-04 falha SMTP recebe 200 genérico', async () => { h.setTransportFailure(true); uniform(await forgot(user.email)); });
test('PR-05 falha SMTP persiste limpeza', async () => {
    h.setTransportFailure(true); await forgot(user.email);
    const value = await saved(); assert.equal(value.resetPasswordToken, undefined); assert.equal(value.resetPasswordExpire, undefined);
});
test('PR-06 sucesso mantém SHA-256 e expiração futura', async () => {
    const token = await h.recoveryToken(user), value = await saved();
    assert.ok(value.resetPasswordToken === crypto.createHash('sha256').update(token).digest('hex'), 'Hash incorreto');
    assert.ok(value.resetPasswordExpire > new Date());
});
test('PR-07 inexistente não cria User ou recuperação', async () => {
    const count = await h.User.countDocuments(), tokens = await h.User.countDocuments({ resetPasswordToken: { $exists: true } });
    await forgot('missing@recovery.example.test');
    assert.equal(await h.User.countDocuments(), count);
    assert.equal(await h.User.countDocuments({ resetPasswordToken: { $exists: true } }), tokens);
});
test('PR-08 inexistente não envia SMTP', async () => { const count = h.mailCount(); await forgot('missing@recovery.example.test'); assert.equal(h.mailCount(), count); });
test('PR-09 existente envia SMTP uma vez', async () => { const count = h.mailCount(); await forgot(user.email); assert.equal(h.mailCount(), count + 1); });
test('PR-10 existente e inexistente recebem sexta tentativa 429', async () => {
    for (const email of [user.email, 'missing@recovery.example.test']) {
        await h.clearRateLimits();
        for (let i = 0; i < 5; i++) uniform(await forgot(email));
        const reply = await forgot(email); assert.equal(reply.status, 429); assert.ok(Number(reply.response.headers.get('retry-after')) > 0);
    }
});
test('PR-11 bloqueio impede SMTP', async () => {
    for (let i = 0; i < 5; i++) await forgot(user.email);
    const count = h.mailCount(); assert.equal((await forgot(user.email)).status, 429); assert.equal(h.mailCount(), count);
});
test('PR-12 bloqueio preserva token e expiração', async () => {
    for (let i = 0; i < 5; i++) await forgot(user.email);
    const a = await saved(); await forgot(user.email); const b = await saved();
    assert.ok(a.resetPasswordToken === b.resetPasswordToken, 'Token alterado após bloqueio');
    assert.equal(a.resetPasswordExpire.getTime(), b.resetPasswordExpire.getTime());
});
test('PR-13 normalização mantém contrato e identidade interna', async () => {
    const count = h.mailCount();
    for (const email of [user.email, user.email.toUpperCase(), '  ' + user.email.toUpperCase() + '  ', [user.email]]) uniform(await forgot(email));
    assert.equal(h.mailCount(), count + 4);
    assert.equal(await h.User.db.collection('authratelimits').countDocuments({ scope: 'forgot:account' }), 1);
});
test('PR-14 resposta não contém PII ou estado interno', async () => {
    const reply = await forgot(user.email), body = JSON.stringify(reply.result);
    assert.ok(!body.includes(user.email) && !body.includes(user.name) && !body.includes(user.id), 'PII na resposta');
    assert.deepEqual(Object.keys(reply.result).sort(), ['message', 'success']);
});
test('PR-15 logging SMTP registra somente evento constante seguro', async () => {
    const original = console.warn, logs = []; console.warn = (...args) => logs.push(args);
    try {
        h.setTransportFailure(true); await forgot(user.email);
        assert.ok(logs.length > 0, 'Falha não registrada');
        assert.ok(logs.every(args => args.length === 1 && args[0] === 'password_recovery_email_failed'), 'Log contém dados não previstos');
    } finally { console.warn = original; }
});
test('PR-16 reset continua single-use', async () => { const token = await h.recoveryToken(user); assert.equal((await reset(token)).status, 200); assert.equal((await reset(token)).status, 400); });
test('PR-17 reset revoga JWT anterior', async () => { const cookie = await h.login(user); await reset(await h.recoveryToken(user)); await h.request('GET', '/me', null, cookie, 401); });
test('PR-18 sessão nova pós-reset autentica', async () => { const reply = await reset(await h.recoveryToken(user)); await h.request('GET', '/me', null, h.cookieOf(reply), 200); });
for (const [id, existing] of [['19', false], ['20', true]]) test('PR-' + id + ' piso temporal ' + (existing ? 'existente' : 'inexistente'), async () => {
    const start = performance.now(); await forgot(existing ? user.email : 'missing@recovery.example.test');
    assert.ok(performance.now() - start >= 18, 'Piso temporal não respeitado');
});
test('PR-21 equalização temporal determinística com relógio e sleep injetados', async () => {
    const { waitForMinimumDuration } = require('../backend/utils/waitForMinimumDuration');
    for (const elapsed of [0, 3, 10, 19, 20, 45]) {
        let time = elapsed, sleeps = [];
        await waitForMinimumDuration(0, 20, { now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; } });
        assert.equal(time, Math.max(20, elapsed));
        assert.deepEqual(sleeps, elapsed < 20 ? [20 - elapsed] : []);
    }
});
test('PR-22 SMTP não configurado mantém contrato e limpa token', async () => {
    h.configure({ HOST: '', USER: '', PASSWORD: '', PORTEMAIL: undefined, EMAIL_SECURE: undefined });
    try { uniform(await forgot(user.email)); assert.equal((await saved()).resetPasswordToken, undefined); }
    finally { h.configure(); }
});
test('PR-23 indisponibilidade do limiter permanece 503 antes do lookup', async () => {
    const model = require('../backend/models/authRateLimitModel'), original = model.collection.findOneAndUpdate;
    model.collection.findOneAndUpdate = async () => { throw new Error('Falha controlada'); };
    try { assert.equal((await forgot(user.email)).status, 503); }
    finally { model.collection.findOneAndUpdate = original; }
});
test('PR-24 falha SMTP antiga não apaga token concorrente mais recente', async () => {
    const mailer = require('nodemailer'), original = mailer.createTransport;
    const newerHash = crypto.randomBytes(32).toString('hex'), newerExpiry = new Date(Date.now() + 60000);
    mailer.createTransport = () => ({ sendMail: async () => {
        await h.User.updateOne({ _id: user.id }, { resetPasswordToken: newerHash, resetPasswordExpire: newerExpiry });
        throw new Error('Falha controlada do envio antigo');
    } });
    try {
        uniform(await forgot(user.email)); const value = await saved();
        assert.ok(value.resetPasswordToken === newerHash, 'Recuperação mais recente apagada');
        assert.equal(value.resetPasswordExpire.getTime(), newerExpiry.getTime());
    } finally { mailer.createTransport = original; }
});
test('PR-25 falha estrutural de consulta não vira sucesso', async () => {
    const original = h.User.findOne;
    h.User.findOne = async () => { throw new Error('Falha estrutural controlada'); };
    try { const reply = await forgot(user.email); assert.equal(reply.status, 500); assert.equal(reply.result.success, false); }
    finally { h.User.findOne = original; }
});
