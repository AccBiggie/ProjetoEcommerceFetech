const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const f = require('./helpers/orderCancellationFixture').fixture();
before(f.start); beforeEach(f.reset); after(f.h.stop);
test('CANCEL unpaid: Stock 4→6, RELEASE/outbox únicos, dinheiro e histórico preservados', async () => {
  const o = await f.create(), initial = await f.raw().findOne({ _id: o.oid });
  assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 4);
  const reply = await f.cancel(o.id), current = await f.raw().findOne({ _id: o.oid });
  assert.equal(current.orderStatus, 'Cancelled'); assert.equal(current.inventoryStatus, 'RELEASED'); assert.ok(current.cancelledAt instanceof Date);
  assert.equal(current.cancellationReasonCode, 'CUSTOMER_REQUEST'); assert.equal(String(current.cancelledByUserId), f.data.users.user.id);
  for (const field of ['orderItems','itemsPriceCents','taxPriceCents','shippingPriceCents','totalPriceCents','shippingInfo','paymentInfo','user']) assert.deepEqual(current[field], initial[field]);
  assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 6); assert.deepEqual(await f.artifacts(o.id), { releases: 1, events: 1, audits: 0 });
  const movement = await f.Movement.findOne({ order: o.id, type: 'RELEASE' }).lean(); assert.equal(movement.delta, 2); assert.equal(movement.stockBefore, 4); assert.equal(movement.stockAfter, 6);
  assert.equal(reply.result.order.cancelledByUserId, undefined); assert.equal(reply.result.order.cancellation.canCancel, false); assert.match(reply.response.headers.get('cache-control'), /no-store/);
  assert.equal((await f.h.request('GET', '/orders/me?status=Cancelled', null, f.customer, 200)).result.orders.some(row => row._id === o.id), true);
  const beforeReplay = await f.snapshot(); await f.cancel(o.id); assert.equal(await f.snapshot(), beforeReplay);
  const creationReplay = await f.h.request('POST', '/order/new', o.body, f.customer, 201, { 'Idempotency-Key': o.key });
  assert.equal(creationReplay.result.order.orderStatus, 'Cancelled'); assert.equal(await f.snapshot(), beforeReplay);
});
for (const admin of [false,true]) for (const [change, code] of [
  [{ paymentStatus: 'PAID' }, 'ORDER_REFUND_REQUIRED'], [{ paidAt: new Date() }, 'ORDER_REFUND_REQUIRED'],
  [{ paymentStatus: 'UNVERIFIED' }, 'ORDER_PAYMENT_UNVERIFIED'], [{ paymentStatus: null }, 'ORDER_PAYMENT_UNVERIFIED'],
  [{ paidAt: 'untrusted' }, 'ORDER_PAYMENT_UNVERIFIED'], [{ orderStatus: 'Shipped' }, 'ORDER_RETURN_REQUIRED'],
  [{ orderStatus: 'Delivered' }, 'ORDER_RETURN_REQUIRED'], [{ deliveredAt: new Date() }, 'ORDER_RETURN_REQUIRED'],
  [{ shippedAt: new Date() }, 'ORDER_RETURN_REQUIRED'], [{ inventoryStatus: null }, 'ORDER_INVENTORY_UNVERIFIED'],
  [{ inventoryVersion: null }, 'ORDER_INVENTORY_UNVERIFIED'], [{ inventoryReservedAt: 'untrusted' }, 'ORDER_INVENTORY_UNVERIFIED'],
]) test('CANCEL guard ' + code + ' admin=' + admin + ' ' + Object.keys(change).join(), async () => {
  const o = await f.create(); await f.raw().updateOne({ _id: o.oid }, { $set: change }); const before = await f.snapshot();
  const reply = await f.cancel(o.id, 409, admin); assert.equal(reply.result.code, code); assert.equal(await f.snapshot(), before);
});
test('CANCEL autorização, CSRF, outra conta, ID e campos extras', async () => {
  const o = await f.create(); const before = await f.snapshot();
  await f.cancel(o.id, 401, false, null); await f.cancel(o.id, 404, false, f.other); await f.cancel(o.id, 403, true, f.customer);
  await f.cancel(o.id, 403, false, f.customer, {}, { 'X-Fetech-CSRF': null }); await f.cancel(o.id, 403, true, f.admin, {}, { Origin: 'https://hostile.example' });
  await f.cancel('invalid', 400); await f.cancel(new f.mongoose.Types.ObjectId(), 404);
  for (const body of [{ quantity: 100 }, { force: true }, { reason: 'PRIVATE_SENTINEL' }, { paymentStatus: 'PENDING' }]) await f.cancel(o.id, 400, false, f.customer, body);
  assert.equal(await f.snapshot(), before);
});
test('CANCEL admin: audit único, archive independente e terminal sem exclusão', async () => {
  const o = await f.create(); await f.h.request('PATCH', '/admin/order/' + o.id + '/archive', {}, f.admin, 200); await f.cancel(o.id, 200, true);
  const saved = await f.raw().findOne({ _id: o.oid }); assert.ok(saved.administrativeArchivedAt); assert.equal(saved.cancellationSource, 'ADMIN');
  assert.deepEqual(await f.artifacts(o.id), { releases: 1, events: 1, audits: 1 }); const before = await f.snapshot();
  await f.cancel(o.id, 200, true);
  for (const status of ['Shipped','Delivered','Processing']) await f.h.request('PUT', '/admin/order/' + o.id, { status }, f.admin, 409);
  await f.h.request('PUT', '/admin/order/' + o.id, { status: 'Cancelled' }, f.admin, 400);
  await f.h.request('DELETE', '/admin/order/' + o.id, null, f.admin, 405); assert.equal(await f.snapshot(), before);
  assert.equal((await f.h.request('GET', '/admin/orders?archived=all&status=Cancelled', null, f.admin, 200)).result.orders.some(row => row._id === o.id), true);
});
for (const corrupt of ['missing-reserve','quantity','duplicate-items','release-present','product-missing','unsafe-stock']) test('CANCEL reserva fail closed ' + corrupt, async () => {
  const o = await f.create();
  if (corrupt === 'missing-reserve') await f.Movement.deleteOne({ order: o.id });
  if (corrupt === 'quantity') await f.mongoose.connection.db.collection('stockmovements').updateOne({ order: o.oid }, { $set: { quantity: 1 } });
  if (corrupt === 'duplicate-items') { const row = await f.raw().findOne({ _id: o.oid }); await f.raw().updateOne({ _id: o.oid }, { $push: { orderItems: row.orderItems[0] } }); }
  if (corrupt === 'release-present') await f.mongoose.connection.db.collection('stockmovements').insertOne({ order: o.oid, product: f.data.products[0]._id, type: 'RELEASE' });
  if (corrupt === 'product-missing') await f.mongoose.connection.db.collection('products').deleteOne({ _id: f.data.products[0]._id });
  if (corrupt === 'unsafe-stock') await f.mongoose.connection.db.collection('products').updateOne({ _id: f.data.products[0]._id }, { $set: { Stock: Number.MAX_SAFE_INTEGER } });
  const before = await f.snapshot(); const reply = await f.cancel(o.id, 409); assert.equal(reply.result.code, 'ORDER_INVENTORY_UNVERIFIED'); assert.equal(await f.snapshot(), before);
  if (corrupt === 'product-missing') await f.Product.collection.insertOne(f.data.products[0].toObject());
});
for (const failure of ['product-third','movement','outbox','audit']) test('CANCEL atomicidade/failure injection ' + failure, async () => {
  const o = await f.create(3); const before = await f.snapshot(); let owner, method, calls = 0;
  if (failure === 'product-third') { owner = f.Product; method = 'findOneAndUpdate'; }
  if (failure === 'movement') { owner = f.Movement; method = 'create'; }
  if (failure === 'outbox') { owner = f.Outbox; method = 'updateOne'; }
  if (failure === 'audit') { owner = f.Audit; method = 'create'; }
  const original = owner[method]; owner[method] = function (...args) { if (failure !== 'product-third' || ++calls === 3) throw new Error('INJECTED'); return original.apply(this, args); };
  try { await f.cancel(o.id, 500, true); } finally { owner[method] = original; }
  assert.equal(await f.snapshot(), before); assert.deepEqual(await f.artifacts(o.id), { releases: 0, events: 0, audits: 0 });
});
test('CANCEL três produtos: preserva preço, reviews, agregados e categoria', async () => {
  const o = await f.create(3), ids = f.data.products.slice(0,3).map(p => p._id); const before = await f.Product.find({ _id: { $in: ids } }).sort({ _id: 1 }).lean();
  await f.cancel(o.id); assert.deepEqual(await f.artifacts(o.id), { releases: 3, events: 1, audits: 0 });
  const after = await f.Product.find({ _id: { $in: ids } }).sort({ _id: 1 }).lean();
  for (let i=0;i<before.length;i++) { assert.equal(after[i].Stock, before[i].Stock + 2); delete before[i].Stock; delete after[i].Stock; assert.deepEqual(after[i], before[i]); }
});
test('CANCEL anonimizado: admin cancela e worker suprime sem chamar provider', async () => {
  const o = await f.create(); await f.mongoose.connection.db.collection('users').updateOne({ _id: f.data.users.user._id }, { $set: { privacyStatus: 'ANONYMIZED', accountStatus: 'DEACTIVATED' } });
  await f.cancel(o.id, 200, true); const event = await f.Outbox.findOne({ entityId: o.id, eventType: 'ORDER_CANCELLED' });
  await f.Outbox.updateMany({ _id: { $ne: event._id } }, { $set: { nextAttemptAt: new Date(Date.now() + 86400000) } });
  let calls = 0; await require('../backend/services/email/worker').createWorker({ provider: { send: () => { calls++; } } }).once();
  assert.equal(calls, 0); assert.equal((await f.Outbox.findById(event._id)).status, 'SUPPRESSED');
  await f.mongoose.connection.db.collection('users').updateOne({ _id: f.data.users.user._id }, { $set: { privacyStatus: 'NORMAL', accountStatus: 'ACTIVE' } });
});
test('CANCEL evento normal via fake, sem PII persistida nem promessa financeira', async () => {
  const o = await f.create(); await f.cancel(o.id); const event = await f.Outbox.findOne({ entityId: o.id, eventType: 'ORDER_CANCELLED' });
  assert.doesNotMatch(JSON.stringify(event), /recipientName|shippingInfo|routes\.example|PRIVATE_SENTINEL/);
  await f.Outbox.updateMany({ _id: { $ne: event._id } }, { $set: { nextAttemptAt: new Date(Date.now() + 86400000) } });
  const fake = require('./helpers/fakeEmailProvider').createFakeEmailProvider(); await require('../backend/services/email/worker').createWorker({ provider: fake }).once();
  assert.equal(fake.calls.length, 1); assert.match(fake.calls[0].text, /foi cancelado/); assert.doesNotMatch(fake.calls[0].text, /reembolso|estorno|devolvid|logística reversa/i);
});
test('CANCEL conta desativada não autentica; admin pode cancelar sua reserva', async () => {
  const o = await f.create();
  await f.mongoose.connection.db.collection('users').updateOne({ _id:f.data.users.user._id },{$set:{accountStatus:'DEACTIVATED',deactivatedAt:new Date(),deactivatedBy:f.data.users.admin._id},$inc:{tokenVersion:1}});
  await f.cancel(o.id,401); await f.cancel(o.id,200,true);
  assert.deepEqual(await f.artifacts(o.id),{releases:1,events:1,audits:1});
});
