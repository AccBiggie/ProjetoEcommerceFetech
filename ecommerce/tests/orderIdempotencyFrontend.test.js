const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const { getOrderAttempt, clearOrderAttempt, ORDER_ATTEMPT_STORAGE } = require('../frontend/src/utils/orderAttempt.mjs');
const payload = () => ({ shippingInfo: { recipientName: 'PII_NAME_SENTINEL', address: 'PII_ADDRESS_SENTINEL', number: '10A',
    complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' },
    orderItems: [{ product: '0123456789abcdef01234567', quantity: 1 }] });
function storage() {
    let stored = null;
    return { getItem(key) { assert.equal(key, ORDER_ATTEMPT_STORAGE); return stored; },
        setItem(key, value) { assert.equal(key, ORDER_ATTEMPT_STORAGE); stored = value; },
        removeItem(key) { assert.equal(key, ORDER_ATTEMPT_STORAGE); stored = null; } };
}
test('ATTEMPT gera UUID seguro e registro sem PII/JWT', async () => {
    const store = storage(), result = await getOrderAttempt(payload(), { storage: store, crypto });
    assert.match(result.key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(JSON.parse(store.getItem(ORDER_ATTEMPT_STORAGE))).sort(), ['fingerprint', 'key']);
    for (const value of ['PII_', '01234567', '04123456789', 'token', 'JWT']) assert.equal(store.getItem(ORDER_ATTEMPT_STORAGE).includes(value), false);
});
test('ATTEMPT fallback usa getRandomValues sem Math.random', async () => {
    const store = storage();
    const value = await getOrderAttempt(payload(), { storage: store, crypto: { subtle: crypto.subtle, getRandomValues: crypto.getRandomValues.bind(crypto) } });
    assert.match(value.key, /^[0-9a-f]{64}$/);
});
test('ATTEMPT retry/reload recria helper e mantém key', async () => {
    const store = storage(), first = await getOrderAttempt(payload(), { storage: store, crypto });
    const module = await import('../frontend/src/utils/orderAttempt.mjs');
    const replay = await module.getOrderAttempt(payload(), { storage: store, crypto });
    assert.deepEqual(replay, first);
});
for (const field of ['quantity', 'shipping', 'product']) test(`ATTEMPT draft diferente ${field} cria nova intenção`, async () => {
    const store = storage(), first = await getOrderAttempt(payload(), { storage: store, crypto });
    const changed = payload();
    if (field === 'quantity') changed.orderItems[0].quantity = 2;
    if (field === 'shipping') changed.shippingInfo.city = 'Campinas';
    if (field === 'product') changed.orderItems[0].product = 'abcdef0123456789abcdef01';
    const next = await getOrderAttempt(changed, { storage: store, crypto });
    assert.notEqual(next.key, first.key); assert.notEqual(next.fingerprint, first.fingerprint);
});
test('ATTEMPT preço/totais/ordem/trims e duplicados não mudam fingerprint', async () => {
    const store = storage(), a = payload(); a.orderItems[0].quantity = 3;
    const first = await getOrderAttempt(a, { storage: store, crypto });
    const b = payload(); b.totalPriceCents = 999;
    b.shippingInfo = Object.fromEntries(Object.entries(b.shippingInfo).reverse().map(([k, v]) => [k, ` ${v} `]));
    b.orderItems.push({ product: b.orderItems[0].product.toUpperCase(), quantity: 2, priceCents: 1 });
    assert.deepEqual(await getOrderAttempt(b, { storage: store, crypto }), first);
});
test('ATTEMPT sucesso remove somente a tentativa confirmada', async () => {
    const store = storage(), first = await getOrderAttempt(payload(), { storage: store, crypto });
    clearOrderAttempt('outra-chave-fixture', { storage: store });
    assert.notEqual(store.getItem(ORDER_ATTEMPT_STORAGE), null);
    clearOrderAttempt(first.key, { storage: store }); assert.equal(store.getItem(ORDER_ATTEMPT_STORAGE), null);
    assert.notEqual((await getOrderAttempt(payload(), { storage: store, crypto })).key, first.key);
});
test('ATTEMPT falha de storage é fechada antes de enviar; estado corrompido não gera key silenciosa', async () => {
    await assert.rejects(getOrderAttempt(payload(), { storage: { getItem: () => '{invalid' }, crypto }));
    await assert.rejects(getOrderAttempt(payload(), { storage: { getItem: () => null, setItem: () => { throw new Error('fixture'); } }, crypto }));
});
