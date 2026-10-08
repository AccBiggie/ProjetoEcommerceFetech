const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const h = require('./authHarness');
let user;
before(h.start); after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); user = await h.createUser(); });
async function environment(nodeEnv, fn, extra = {}) {
    const values = { NODE_ENV: nodeEnv, ...extra }, previous = {};
    for (const key of Object.keys(values)) { previous[key] = process.env[key]; process.env[key] = values[key]; }
    h.configure({ NODE_ENV: nodeEnv, FRONTEND_URL: nodeEnv === 'production' ? 'https://shop.example.test' : 'http://127.0.0.1:3300', ...extra });
    try { return await fn(); }
    finally { h.configure(); for (const key of Object.keys(values)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
function attributes(reply) {
    const header = reply.response.headers.get('set-cookie');
    assert.ok(header && header.startsWith('token='), 'Cookie token ausente');
    // Descartar o valor antes de qualquer comparação ou diagnóstico.
    return Object.fromEntries(header.split(';').slice(1).map(part => {
        const [key, ...value] = part.trim().split('='); return [key.toLowerCase(), value.length ? value.join('=') : true];
    }));
}
function policy(reply, secure) {
    const a = attributes(reply); assert.equal(a.httponly, true); assert.equal(a.samesite, 'Lax');
    assert.equal(a.path, '/'); assert.equal(Boolean(a.secure), secure); assert.equal(a.domain, undefined);
    return a;
}
const login = headers => h.request('POST', '/login', { email: user.email, password: h.password }, null, 200, headers);
const logout = cookie => h.request('POST', '/logout', null, cookie, 200);
const config = () => require('../backend/config/authCookie');
const proxy = () => require('../backend/config/trustProxy');
test('CC-01 desenvolvimento HTTP mantém cookie utilizável', () => environment('development', async () => policy(await login(), false)));
test('CC-02 produção impõe Secure', () => environment('production', async () => policy(await login(), true)));
test('CC-03 override inseguro não desliga Secure', () => environment('production', async () => policy(await login(), true), { COOKIE_SECURE: 'false' }));
test('CC-04 cadastro usa atributos de produção', () => environment('production', async () => {
    const r = await h.request('POST', '/register', { name: 'Cadastro cookie', email: 'register' + user.email, password: h.password }, null, 201); policy(r, true);
}));
test('CC-05 login usa atributos de produção', () => environment('production', async () => policy(await login(), true)));
test('CC-06 alteração de senha usa política e revoga JWT anterior', () => environment('production', async () => {
    const old = h.cookieOf(await login()), password = 'CookieSessionNext123!';
    const r = await h.request('PUT', '/password/update', { oldPassword: h.password, newPassword: password, confirmPassword: password }, old, 200);
    policy(r, true); await h.request('GET', '/me', null, old, 401);
}));
test('CC-07 reset usa política e revoga JWT anterior', () => environment('production', async () => {
    const old = h.cookieOf(await login()), token = await h.recoveryToken(user);
    const r = await h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password }, null, 200);
    policy(r, true); await h.request('GET', '/me', null, old, 401);
}));
for (const [id, env, secure] of [['08', 'development', false], ['09', 'production', true]]) test('CC-' + id + ' logout limpa cookie em ' + env, () => environment(env, async () => {
    const r = await logout(h.cookieOf(await login())), a = policy(r, secure);
    assert.ok(new Date(a.expires).getTime() <= Date.now(), 'Cookie não expirado');
    assert.ok(r.response.headers.get('set-cookie').startsWith('token=;'), 'Cookie não foi limpo');
}));
for (const [id, name] of [['10', 'path'], ['11', 'samesite'], ['12', 'secure']]) test('CC-' + id + ' criação/limpeza têm mesmo ' + name, () => environment('production', async () => {
    const a = await login(), b = await logout(h.cookieOf(a)); assert.equal(attributes(a)[name], attributes(b)[name]);
}));
test('CC-13 HttpOnly em development/test/production', async () => { for (const env of ['development', 'test', 'production']) await environment(env, async () => assert.equal(attributes(await login()).httponly, true)); });
test('CC-14 cookie host-only sem Domain', async () => assert.equal(attributes(await login()).domain, undefined));
test('CC-15 COOKIE_EXPIRE mantém duração de sete dias', async () => {
    const start = Date.now(), expires = new Date(attributes(await login()).expires).getTime();
    assert.ok(Math.abs(expires - start - 7 * 86400000) < 10000, 'Duração divergente');
});
test('CC-16 logout em produção mantém replay 401', () => environment('production', async () => {
    const old = h.cookieOf(await login()); await logout(old); await h.request('GET', '/me', null, old, 401);
}));
test('CC-17 logout antigo não revoga sessão nova', async () => {
    const a = h.cookieOf(await login()); await logout(a); const b = h.cookieOf(await login()); await logout(a); await h.request('GET', '/me', null, b, 200);
});
test('CC-18 trust proxy default false', () => assert.equal(require('../backend/app').get('trust proxy'), false));
test('CC-19 X-Forwarded-For não cria bypass no default', async () => {
    for (let i = 0; i < 5; i++) await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 401, { 'X-Forwarded-For': '203.0.113.' + (i + 1) });
    await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 429, { 'X-Forwarded-For': '198.51.100.9' });
});
test('CC-20 hops 1 aplica cadeia direita para esquerda em servidor isolado', async () => {
    const express = require('express'), app = express(); app.set('trust proxy', proxy().getTrustProxySetting('1'));
    app.get('/', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
    const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const r = await fetch('http://127.0.0.1:' + server.address().port, { headers: { 'X-Forwarded-For': '203.0.113.5, 198.51.100.7', 'X-Forwarded-Proto': 'https' } });
        assert.deepEqual(await r.json(), { ip: '198.51.100.7', secure: true }); assert.equal(app.get('trust proxy'), 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
test('CC-21 hops inválidos são rejeitados', () => {
    for (const value of ['-1', 'abc', '999', 'true', '*', 'all', '', '1.5', '01']) assert.throws(() => proxy().getTrustProxySetting(value), /TRUST_PROXY_HOPS/);
});
test('CC-22 F008 mantém sexta tentativa 429 e Retry-After', async () => {
    for (let i = 0; i < 5; i++) await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 401);
    const r = await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 429); assert.ok(Number(r.response.headers.get('retry-after')) > 0);
});
test('CC-23 F009 preserva recuperação uniforme', async () => {
    const a = await h.request('POST', '/password/forgot', { email: user.email }, null, 200), b = await h.request('POST', '/password/forgot', { email: 'missing@cookie.example.test' }, null, 200); assert.deepEqual(a.result, b.result);
});
test('CC-24 F010 mantém autoações 403', async () => {
    const admin = await h.createUser('admin'), cookie = await h.login(admin);
    await h.request('PUT', '/admin/user/' + admin.id, { role: 'user' }, cookie, 403); await h.request('DELETE', '/admin/user/' + admin.id, null, cookie, 403);
});
test('CC-25 todos os emissores têm atributos equivalentes', () => environment('production', async () => {
    const replies = [await login(), await h.request('POST', '/register', { name: 'Emissor cookie', email: 'emitter' + user.email, password: h.password }, null, 201)];
    replies.push(await h.request('PUT', '/password/update', { oldPassword: h.password, newPassword: h.password, confirmPassword: h.password }, h.cookieOf(replies[0]), 200));
    const token = await h.recoveryToken(user); replies.push(await h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password }, null, 200));
    for (const reply of replies) policy(reply, true);
}));
test('CC-26 login/logout/login emitem um único cookie no Path raiz', async () => {
    const a = await login(), b = await logout(h.cookieOf(a)), c = await login();
    for (const r of [a, b, c]) { assert.equal(r.response.headers.getSetCookie().length, 1); assert.equal(attributes(r).path, '/'); }
});
test('CC-27 expiração inválida é recusada sem gerar data inválida', () => {
    for (const value of ['', 'abc', '-1', '0', 'Infinity', '1e100']) assert.throws(() => config().getAuthCookieOptions({ nodeEnv: 'test', cookieExpire: value, now: 0 }), /COOKIE_EXPIRE/);
    assert.equal(config().getAuthCookieOptions({ nodeEnv: 'test', cookieExpire: '0.5', now: 0 }).expires.getTime(), 43200000);
});
test('CC-28 proxy inválido impede inicialização do app', () => {
    const r = spawnSync(process.execPath, ['-e', "require('./backend/app')"], { cwd: path.join(__dirname, '..'), env: { ...process.env, TRUST_PROXY_HOPS: 'true' }, encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.ok(r.stderr.includes('TRUST_PROXY_HOPS'), 'Erro de configuração não identificado');
});
test('CC-29 headers de protocolo não controlam Secure', () => environment('production', async () => {
    policy(await login({ 'X-Forwarded-Proto': 'http' }), true); policy(await login({ 'X-Forwarded-Proto': 'https' }), true);
}));
test('CC-30 limpeza independe da duração e não repassa expires/maxAge', () => {
    const options = config().getClearAuthCookieOptions({ nodeEnv: 'production' });
    assert.deepEqual(options, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
});
test('CC-31 COOKIE_EXPIRE ausente ou inválido impede inicialização', () => {
    for (const value of [undefined, '', 'abc', '0']) {
        const env = { ...process.env }; if (value === undefined) delete env.COOKIE_EXPIRE; else env.COOKIE_EXPIRE = value;
        const r = spawnSync(process.execPath, ['-e', "require('./backend/app')"], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
        assert.notEqual(r.status, 0); assert.ok(r.stderr.includes('COOKIE_EXPIRE'), 'Erro de duração não identificado');
    }
});
test('CC-32 default ausente e hops 0..5 são aplicados exatamente', () => {
    const env = { ...process.env }; delete env.TRUST_PROXY_HOPS;
    const r = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./backend/app').get('trust proxy')))"], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
    assert.equal(r.status, 0); assert.equal(r.stdout.trim(), 'false');
    for (let i = 0; i <= 5; i++) assert.equal(proxy().getTrustProxySetting(String(i)), i === 0 ? false : i);
});
test('CC-33 ambientes desconhecidos seguem política não produtiva documentada', () => {
    assert.equal(config().getAuthCookieOptions({ nodeEnv: 'unknown', cookieExpire: '7' }).secure, false);
    assert.equal(config().getAuthCookieOptions({ nodeEnv: 'test', cookieExpire: '7' }).secure, false);
});
