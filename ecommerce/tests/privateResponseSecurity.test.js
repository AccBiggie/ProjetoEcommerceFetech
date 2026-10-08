const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./authHarness');
const { fixtures } = require('./fixtures');
const Address = require('../backend/models/addressModel');
let data, user, cookie;
before(async () => { await h.start(); data = await fixtures(); });
after(h.stop);
beforeEach(async () => { await h.clearRateLimits(); user = await h.createUser(); cookie = await h.login(user); });
function noStore(reply) {
    assert.ok((reply.response.headers.get('cache-control') || '').split(',').some(value => value.trim().toLowerCase() === 'no-store'), 'no-store ausente');
}
function noSessionFields(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert.ok(!['token', 'jwt', 'accessToken', 'authToken', 'sessionToken'].includes(key), 'Segredo de sessão no JSON');
        noSessionFields(child);
    }
}
function session(reply) {
    noSessionFields(reply.result); noStore(reply);
    assert.equal(reply.result.success, true);
    const header = reply.response.headers.get('set-cookie');
    assert.ok(Boolean(header && header.startsWith('token=')), 'Cookie ausente');
    assert.ok(/; HttpOnly/i.test(header), 'HttpOnly ausente');
    for (const name of ['authorization', 'x-auth-token', 'x-access-token']) assert.equal(reply.response.headers.has(name), false);
}
const login = () => h.request('POST', '/login', { email: user.email, password: h.password }, null, 200);
const register = () => h.request('POST', '/register', { name: 'Cliente privado', email: 'new' + user.email, password: h.password }, null, 201);
const update = () => h.request('PUT', '/password/update', { oldPassword: h.password, newPassword: h.password, confirmPassword: h.password }, cookie, 200);
async function reset() {
    const token = await h.recoveryToken(user);
    return h.request('PUT', '/password/reset/' + token, { password: h.password, confirmPassword: h.password }, null, 200);
}
const addressBody = () => ({ label: 'Teste', recipientName: 'Cliente temporário', address: 'Rua Teste', number: '1', neighborhood: 'Centro', city: 'Maringá', state: 'PR', country: 'Brasil', pinCode: '87000000', phoneNo: '44999999999' });
const address = () => Address.create({ ...addressBody(), user: user.id });
const order = () => h.request('POST', '/order/new', { shippingInfo: addressBody(), orderItems: [{ product: data.products[0].id, quantity: 1 }] }, cookie, 201, { 'Idempotency-Key': require('node:crypto').randomUUID() });
async function getPrivate(route, currentCookie = cookie) { const reply = await h.request('GET', route, null, currentCookie, 200); noStore(reply); return reply; }

test('PRV-01 login não devolve JWT JSON', async () => noSessionFields((await login()).result));
test('PRV-02 login mantém cookie HttpOnly e no-store', async () => session(await login()));
test('PRV-03 cadastro sem JWT JSON, com cookie/no-store', async () => session(await register()));
test('PRV-04 troca de senha sem JWT JSON revoga sessão anterior', async () => { const reply = await update(); session(reply); await h.request('GET', '/me', null, cookie, 401); await getPrivate('/me', h.cookieOf(reply)); });
test('PRV-05 reset sem JWT JSON revoga sessão anterior', async () => { const reply = await reset(); session(reply); await h.request('GET', '/me', null, cookie, 401); await getPrivate('/me', h.cookieOf(reply)); });
test('PRV-06 replay captura JWT somente do Set-Cookie', async () => {
    const reply = await login(); noSessionFields(reply.result);
    const value = h.extractCookieValue(reply.response.headers.getSetCookie());
    assert.ok(Boolean(value), 'Valor do cookie ausente');
    assert.equal(h.jwt.verify(value, process.env.JWT_SECRET).tokenVersion, 0);
    await getPrivate('/me', h.cookieOf(reply));
});
test('PRV-07 logout sem JWT, no-store, cookie expirado e replay 401', async () => {
    const reply = await h.request('POST', '/logout', null, cookie, 200); noSessionFields(reply.result); noStore(reply);
    assert.ok(reply.response.headers.get('set-cookie').startsWith('token=;'), 'Cookie não limpo');
    await h.request('GET', '/me', null, cookie, 401);
});
test('PRV-08 perfil privado no-store', () => getPrivate('/me'));
test('PRV-09 perfil sem sessão e sessão inválida: 401 no-store', async () => {
    for (const current of [null, 'token=invalid']) noStore(await h.request('GET', '/me', null, current, 401));
});
test('PRV-10 lista de endereços no-store', () => getPrivate('/addresses'));
test('PRV-11 endereço individual no-store', async () => getPrivate('/address/' + (await address()).id));
test('PRV-12 criação e edição de endereço no-store', async () => {
    const reply = await h.request('POST', '/address/new', addressBody(), cookie, 201); noStore(reply);
    noStore(await h.request('PUT', '/address/' + reply.result.address._id, { ...addressBody(), label: 'Editado' }, cookie, 200));
});
test('PRV-13 lista de pedidos no-store', () => getPrivate('/orders/me'));
test('PRV-14 detalhe de pedido no-store', async () => getPrivate('/order/' + (await order()).result.order._id));
test('PRV-15 criação de pedido no-store', async () => noStore(await order()));
for (const [id, route] of [['16', '/admin/users'], ['17', '/admin/orders'], ['18', '/admin/products'], ['19', '/admin/categories']]) {
    test('PRV-' + id + ' ' + route + ' no-store', async () => getPrivate(route, await h.login(data.users.admin)));
}
function publicReply(reply) { assert.ok(!(reply.response.headers.get('cache-control') || '').includes('no-store'), 'no-store indevido em recurso público'); }
test('PRV-20 catálogo público preservado', async () => publicReply(await h.request('GET', '/products', null, null, 200)));
test('PRV-21 produto público preservado', async () => publicReply(await h.request('GET', '/product/' + data.products[0].id, null, null, 200)));
test('PRV-22 cookie em catálogo não torna resposta privada', async () => publicReply(await h.request('GET', '/products', null, cookie, 200)));
test('PRV-23 erro admin 403 preserva no-store', async () => noStore(await h.request('GET', '/admin/users', null, cookie, 403)));
test('PRV-24 erro 500 posterior à autenticação mantém no-store sem stack', async () => {
    const original = h.User.findById; let calls = 0;
    h.User.findById = function (...args) { if (++calls === 2) throw new Error('Falha controlada'); return original.apply(this, args); };
    try { const reply = await h.request('GET', '/me', null, cookie, 500); noStore(reply); assert.ok(!('stack' in reply.result)); }
    finally { h.User.findById = original; }
});
test('PRV-25 quatro emissores não usam campos substitutos', async () => {
    for (const emitter of [register, login, update, reset]) session(await emitter());
});
test('PRV-26 cookie e tokenVersion preservados sem logout global', async () => {
    const version = (await h.User.findById(user.id)).tokenVersion; session(await login());
    assert.equal((await h.User.findById(user.id)).tokenVersion, version); await getPrivate('/me');
});
test('PRV-27 categorias e reviews públicas com cookie preservadas', async () => {
    for (const route of ['/categories', '/category/' + data.products[0].category_id, '/reviews?id=' + data.products[0].id]) publicReply(await h.request('GET', route, null, cookie, 200));
});
test('PRV-28 favorito e exclusão de endereço no-store', async () => {
    const value = await address(); noStore(await h.request('PUT', '/address/' + value.id + '/favorite', null, cookie, 200));
    noStore(await h.request('DELETE', '/address/' + value.id, null, cookie, 200));
});
test('PRV-29 review autenticada no-store', async () => noStore(await h.request('PUT', '/review', { productId: data.products[0].id, rating: 5, comment: 'Teste temporário' }, cookie, 200)));
test('PRV-30 perfil atualizado no-store', async () => noStore(await h.request('PUT', '/me/update', { name: 'Atualizado', email: user.email }, cookie, 200)));
test('PRV-31 erro de validação privado no-store', async () => noStore(await h.request('POST', '/order/new', {}, cookie, 400)));
test('PRV-32 produção preserva política F007', async () => {
    const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; h.configure({ NODE_ENV: 'production', FRONTEND_URL: 'https://shop.example.test' });
    try { const reply = await login(); session(reply); const attrs = reply.response.headers.get('set-cookie').split(';').slice(1).join(';');
        assert.ok(/Secure/i.test(attrs)); assert.ok(/SameSite=Lax/i.test(attrs)); assert.ok(/Path=\//i.test(attrs)); assert.ok(!/Domain=/i.test(attrs)); }
    finally { process.env.NODE_ENV = previous; h.configure(); }
});
test('PRV-33 F008 mantém 429 e Retry-After', async () => {
    for (let i = 0; i < 5; i++) await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 401);
    const reply = await h.request('POST', '/login', { email: user.email, password: 'invalid-fixture' }, null, 429);
    assert.ok(Number(reply.response.headers.get('retry-after')) > 0);
});
test('PRV-34 F009 recuperação uniforme', async () => {
    const first = await h.request('POST', '/password/forgot', { email: user.email }, null, 200);
    const second = await h.request('POST', '/password/forgot', { email: 'missing@private.example.test' }, null, 200);
    assert.deepEqual(first.result, second.result);
});
test('PRV-35 F010 autoações 403 no-store', async () => {
    const admin = data.users.admin, current = await h.login(admin);
    noStore(await h.request('PUT', '/admin/user/' + admin.id, { role: 'user' }, current, 403));
    noStore(await h.request('DELETE', '/admin/user/' + admin.id, null, current, 403));
});
