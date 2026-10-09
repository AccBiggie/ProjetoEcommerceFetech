const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const { storageRegistry: r, encodeStoredValue } = require('../frontend/src/storage/storageRegistry.mjs');
const safe = require('../frontend/src/storage/safeStorage.mjs');
const { getOrderAttempt, clearOrderAttempt } = require('../frontend/src/utils/orderAttempt.mjs');
function fake(entries = {}) {
    const values = new Map(Object.entries(entries)), calls = [];
    return { values, calls, fail: {}, getItem(key) { calls.push(['get', key]); if (this.fail.get) throw new Error('PRIVATE_STORAGE_SENTINEL'); return values.get(key) ?? null; },
        setItem(key, value) { calls.push(['set', key]); if (this.fail.set) throw new Error('QuotaExceededError PRIVATE_STORAGE_SENTINEL'); values.set(key, value); },
        removeItem(key) { calls.push(['remove', key]); if (this.fail.remove) throw new Error('PRIVATE_STORAGE_SENTINEL'); values.delete(key); }, clear() { throw new Error('Forbidden generic clear'); } };
}
const item = extra => ({ product: '0123456789abcdef01234567', name: 'Produto', image: '/Profile.png', stock: 10, priceCents: 1990, quantity: 1, ...extra });
const attempt = { key: 'test-idempotency-key-0123', fingerprint: 'a'.repeat(64) };
const payload = () => ({ shippingInfo: { recipientName: 'Fixture', address: 'Rua', number: '01A', complement: '', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' }, orderItems: [{ product: '0123456789abcdef01234567', quantity: 1 }] });
beforeEach(() => safe.dismissStorageNotices());
for (const spec of Object.values(r)) test(`STORAGE missing ${spec.key}`, () => {
    const storage = fake(); const result = safe.readStoredValue(spec, { storage }); assert.equal(result.ok, true); assert.deepEqual(result.value, spec.defaultValue()); assert.equal(storage.calls.some(v => v[0] !== 'get'), false);
});
for (const [spec, value] of [[r.cart, [item()]], [r.shipping, payload().shippingInfo], [r.theme, 'dark'], [r.attempt, attempt]]) test(`STORAGE round-trip current ${spec.key}`, () => {
    const storage = fake(); assert.equal(safe.writeStoredValue(spec, value, { storage }).ok, true); const first = safe.readStoredValue(spec, { storage }); assert.equal(first.sourceVersion, 1); assert.equal(first.ok, true); assert.equal(safe.writeStoredValue(spec, first.value, { storage }).ok, true); assert.deepEqual(safe.readStoredValue(spec, { storage }).value, first.value);
});
for (const raw of ['{', '{}', '"abc"', 'null', 'true', '123']) test(`STORAGE cart rejects root ${raw}`, () => {
    const storage = fake({ cartItems: raw, unrelated: 'PRIVATE_VALUE', [r.attempt.key]: JSON.stringify(attempt) });
    const result = safe.readStoredValue(r.cart, { storage }); assert.equal(result.ok, false); assert.deepEqual(result.value, []); assert.equal(storage.values.has('cartItems'), false); assert.equal(storage.values.get('unrelated'), 'PRIVATE_VALUE'); assert.equal(storage.values.get(r.attempt.key), JSON.stringify(attempt));
});
for (const spec of [r.cart, r.shipping, r.theme]) test(`STORAGE unsupported version preserves ${spec.key}`, () => {
    const raw = '{"version":99,"data":"PRIVATE_SENTINEL"}', storage = fake({ [spec.key]: raw });
    assert.equal(safe.readStoredValue(spec, { storage }).reason, 'UNSUPPORTED_VERSION'); assert.equal(storage.values.get(spec.key), raw);
});
test('STORAGE migrations deterministic and compare-before-rewrite', () => {
    const storage = fake({ cartItems: JSON.stringify([item({ priceCents: undefined, price: '19.90' })]) });
    const a = safe.readStoredValue(r.cart, { storage }); assert.equal(a.value[0].priceCents, 1990); assert.equal(a.sourceVersion, 0);
    const raw = storage.values.get(r.cart.key); safe.readStoredValue(r.cart, { storage }); assert.equal(storage.values.get(r.cart.key), raw);
    const racing = fake({ cartItems: '[]' }); let reads = 0; const original = racing.getItem.bind(racing);
    racing.getItem = key => { if (++reads === 2) racing.values.set(key, encodeStoredValue(r.cart, [item()])); return original(key); };
    safe.readStoredValue(r.cart, { storage: racing }); assert.equal(JSON.parse(racing.values.get(r.cart.key)).data.length, 1);
});
test('STORAGE recovery compare avoids removing another tab value', () => {
    const storage = fake({ cartItems: '{' }); let reads = 0; const original = storage.getItem.bind(storage);
    storage.getItem = key => { if (++reads === 2) storage.values.set(key, '[]'); return original(key); };
    safe.readStoredValue(r.cart, { storage }); assert.equal(storage.values.get(r.cart.key), '[]');
});
for (const spec of Object.values(r)) test(`STORAGE getItem SecurityError ${spec.key}`, () => {
    const storage = fake(); storage.fail.get = true; assert.equal(safe.readStoredValue(spec, { storage }).reason, 'STORAGE_READ_FAILED');
});
test('STORAGE native storage getter may throw before getItem', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try { assert.equal(safe.readStoredValue(r.cart).reason, 'STORAGE_READ_FAILED'); assert.equal(safe.writeStoredValue(r.cart, []).ok, false); assert.equal(safe.removeStoredValue(r.cart).ok, false); }
    finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});
test('STORAGE quota does not throw; valid migrated value survives in memory', () => {
    const storage = fake({ cartItems: JSON.stringify([item()]) }); storage.fail.set = true;
    assert.equal(safe.writeStoredValue(r.cart, [item()], { storage }).ok, false); assert.equal(safe.readStoredValue(r.cart, { storage }).value.length, 1);
});
test('STORAGE remove throws controlled and does not erase other keys', () => {
    const storage = fake({ cartItems: '{', unrelated: 'keep' }); storage.fail.remove = true;
    assert.equal(safe.readStoredValue(r.cart, { storage }).ok, false); assert.equal(safe.removeStoredValue(r.cart, { storage }).ok, false); assert.equal(storage.values.get('unrelated'), 'keep');
});
test('STORAGE diagnostics contain no raw values and deduplicate StrictMode reads', () => {
    const storage = fake({ cartItems: 'PRIVATE_CORRUPTION_SENTINEL' }); storage.fail.remove = true;
    const calls = []; const original = console.error; console.error = (...args) => calls.push(args);
    try { safe.readStoredValue(r.cart, { storage }); safe.readStoredValue(r.cart, { storage }); }
    finally { console.error = original; }
    assert.equal(JSON.stringify(safe.getStorageNotices()).includes('PRIVATE'), false); assert.equal(safe.getStorageNotices().filter(v => v.reason === 'INVALID_JSON').length, 1); assert.deepEqual(calls, []);
});
test('STORAGE no permanent notice after successful recovery and second reload', () => {
    const storage = fake({ cartItems: '{' }); safe.readStoredValue(r.cart, { storage }); safe.dismissStorageNotices();
    safe.readStoredValue(r.cart, { storage }); assert.deepEqual(safe.getStorageNotices(), []);
});
test('STORAGE unknown fields allowlisted without prototype pollution', () => {
    const storage = fake({ shippingInfo: '{"number":"01A","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"token":"PRIVATE"}' });
    assert.deepEqual(safe.readStoredValue(r.shipping, { storage }).value, { number: '01A' }); assert.equal({}.polluted, undefined); assert.equal(storage.values.get('shippingInfo').includes('PRIVATE'), false);
});
test('STORAGE arbitrary keys/specs cannot access storage', () => {
    const storage = fake(); const spec = { ...r.cart, key: 'attacker' }; assert.equal(safe.readStoredValue(spec, { storage }).reason, 'UNKNOWN_SPEC'); assert.equal(safe.writeStoredValue(spec, [], { storage }).ok, false); assert.equal(safe.removeStoredValue(spec, { storage }).ok, false); assert.deepEqual(storage.calls, []);
});
test('STORAGE huge raw rejected before parse; count bound rejects oversized array', () => {
    const storage = fake({ cartItems: 'x'.repeat(r.cart.maxBytes + 1) }); assert.equal(safe.readStoredValue(r.cart, { storage }).reason, 'VALUE_TOO_LARGE'); assert.equal(safe.writeStoredValue(r.cart, Array(1001).fill(item()), { storage }).ok, false);
});
test('STORAGE circular or nonserializable write is controlled', () => {
    const circular = {}; circular.recipientName = circular;
    assert.equal(safe.writeStoredValue(r.shipping, circular, { storage: fake() }).ok, false);
    assert.equal(safe.writeStoredValue(r.cart, [item({ name: 1n })], { storage: fake() }).ok, true); // Normalizer removes unsafe render values.
});
for (const price of ['0.105', '-1', '19.90\n', true]) test(`STORAGE F014 invalid money remains removable ${price}`, () => {
    const storage = fake({ cartItems: JSON.stringify([item({ priceCents: undefined, price }), item()]) });
    const value = safe.readStoredValue(r.cart, { storage }).value; assert.equal(value.length, 2); assert.equal(value[0].moneyInvalid, true); assert.equal(value[1].priceCents, 1990); assert.equal(value[0].product, item().product);
});
test('STORAGE F014 canonical cents win; overflow and corrupt items cannot enable checkout', () => {
    const storage = fake({ cartItems: JSON.stringify([item({ price: '0.105' }), item({ priceCents: Number.MAX_SAFE_INTEGER, quantity: 2 }), null, { name: { bad: true } }]) });
    const value = safe.readStoredValue(r.cart, { storage }).value; assert.equal(value[0].priceCents, 1990); assert.equal(value[0].moneyInvalid, undefined); value.slice(1).forEach(i => assert.equal(i.moneyInvalid, true)); assert.equal(typeof value[3].name, 'string');
});
test('STORAGE shipping leading zeros and alphanumeric number stay strings', () => {
    const storage = fake({ shippingInfo: JSON.stringify(payload().shippingInfo) }); const value = safe.readStoredValue(r.shipping, { storage }).value;
    assert.equal(value.pinCode, '01234567'); assert.equal(value.phoneNo, '04123456789'); assert.equal(value.number, '01A');
});
for (const raw of ['[]', 'null', '{"pinCode":123}', '{"phoneNo":true}']) test(`STORAGE invalid delivery draft ${raw}`, () => {
    assert.equal(safe.readStoredValue(r.shipping, { storage: fake({ shippingInfo: raw }) }).ok, false);
});
test('STORAGE theme raw legacy migrated, invalid default, future preserved', () => {
    const storage = fake({ [r.theme.key]: 'dark' }); assert.equal(safe.readStoredValue(r.theme, { storage }).value, 'dark'); assert.deepEqual(JSON.parse(storage.values.get(r.theme.key)), { version: 1, data: 'dark' });
});
test('STORAGE generic interface reset preserves commercial/cart/draft and unknown keys', () => {
    const storage = fake({ [r.attempt.key]: JSON.stringify(attempt), cartItems: '[]', shippingInfo: '{}', [r.theme.key]: 'dark', user: 'PRIVATE' });
    safe.restoreInterfacePreferences({ storage }); assert.equal(storage.values.get(r.attempt.key), JSON.stringify(attempt)); assert.equal(storage.values.get('cartItems'), '[]'); assert.equal(storage.values.get('shippingInfo'), '{}'); assert.equal(storage.values.get('user'), 'PRIVATE'); assert.equal(storage.values.has(r.theme.key), false); assert.deepEqual(storage.calls, [['remove', r.theme.key]]);
});
test('STORAGE F005 valid attempt survives generic recovery and helper reload with same key', async () => {
    const storage = fake(); const first = await getOrderAttempt(payload(), { storage, crypto }); safe.restoreInterfacePreferences({ storage });
    assert.deepEqual(await getOrderAttempt(payload(), { storage, crypto }), first); assert.deepEqual(Object.keys(JSON.parse(storage.values.get(r.attempt.key))).sort(), ['fingerprint', 'key']);
});
for (const raw of ['{', 'null', '[]', '{}', '{"key":"short","fingerprint":"a"}', '{"key":123,"fingerprint":false}']) test(`STORAGE F005 corrupt blocks new key; marker survives reload ${raw}`, async () => {
    const storage = fake({ [r.attempt.key]: raw }); let generated = 0; const hookedCrypto = { ...crypto, subtle: crypto.subtle, randomUUID() { generated++; return crypto.randomUUID(); } };
    await assert.rejects(getOrderAttempt(payload(), { storage, crypto: hookedCrypto }), /Confira seus pedidos/); assert.equal(generated, 0);
    const marker = storage.values.get(r.attempt.key); assert.deepEqual(JSON.parse(marker), { recoveryRequired: true });
    const reloaded = fake({ [r.attempt.key]: marker }); await assert.rejects(getOrderAttempt(payload(), { storage: reloaded, crypto }), /Confira seus pedidos/);
});
test('STORAGE F005 explicit reviewed recovery removes only invalid attempt; never valid attempt', async () => {
    const storage = fake({ [r.attempt.key]: '{', other: 'keep' }); safe.readStoredValue(r.attempt, { storage });
    assert.equal(safe.acknowledgeCommercialRecovery({ storage }), true); assert.equal(storage.values.get('other'), 'keep');
    const first = await getOrderAttempt(payload(), { storage, crypto }); assert.equal(safe.acknowledgeCommercialRecovery({ storage }), false); assert.equal((await getOrderAttempt(payload(), { storage, crypto })).key, first.key);
});
test('STORAGE F005 inaccessible getter/get/set all fail before generation/send', async () => {
    for (const failure of ['get', 'set']) { const storage = fake(); storage.fail[failure] = true; await assert.rejects(getOrderAttempt(payload(), { storage, crypto })); }
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'); Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try { await assert.rejects(getOrderAttempt(payload(), { crypto }), /Confira seus pedidos/); } finally { if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor); else delete globalThis.sessionStorage; }
});
test('STORAGE F005 read-only existing attempt cannot authorize another POST', async () => {
    const storage = fake(); await getOrderAttempt(payload(), { storage, crypto }); storage.fail.set = true; await assert.rejects(getOrderAttempt(payload(), { storage, crypto }), /preservar/);
});
test('STORAGE F005 terminal cleanup does not throw when remove fails', async () => {
    const storage = fake(); const first = await getOrderAttempt(payload(), { storage, crypto }); storage.fail.remove = true;
    assert.equal(clearOrderAttempt(first.key, { storage }), false); assert.equal(JSON.parse(storage.values.get(r.attempt.key)).key, first.key);
});
test('STORAGE F005 corrupted marker write failure remains blocked in memory', async () => {
    const storage = fake({ [r.attempt.key]: '{' }); storage.fail.set = true; await assert.rejects(getOrderAttempt(payload(), { storage, crypto }));
    storage.values.delete(r.attempt.key); storage.fail.set = false; await assert.rejects(getOrderAttempt(payload(), { storage, crypto }));
});
