const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const f = require('./helpers/orderCancellationFixture').fixture();
before(f.start); beforeEach(f.reset); after(f.h.stop);
const count = async o => assert.deepEqual(await f.artifacts(o.id), { releases: 1, events: 1, audits: 1 });
test('CANCEL concorrente: duas requests administrativas, um único release/event/audit', async () => {
  const o = await f.create(); await Promise.all([f.cancel(o.id,200,true), f.cancel(o.id,200,true)]); await count(o);
  assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 6);
});
test('CANCEL multi-process: duas APIs/conexões independentes compartilham CAS transacional', async () => {
  const { fork } = require('node:child_process'), { once } = require('node:events');
  const children = []; const o = await f.create();
  try {
    const ports = await Promise.all([0,1].map(async () => {
      const child = fork(require.resolve('./helpers/orderIdempotencyWorker'), [], { env: { ...process.env }, stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true }); children.push(child);
      const [message] = await once(child, 'message'); assert.equal(typeof message.port, 'number'); return message.port;
    }));
    const responses = await Promise.all(ports.map(port => fetch(`http://127.0.0.1:${port}/api/v1/admin/order/${o.id}/cancel`, { method: 'POST', headers: { Cookie: f.admin, 'Content-Type': 'application/json', 'X-Fetech-CSRF': '1' }, body: '{}', signal: AbortSignal.timeout(15000) })));
    assert.deepEqual(responses.map(r=>r.status), [200,200]); await count(o); assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 6);
  } finally { await Promise.all(children.map(async child => { if (child.exitCode === null) { child.send('stop'); await once(child, 'exit'); } })); }
});
test('CANCEL retry Mongo após writes parciais não duplica artefatos', async () => {
  const o = await f.create(); const original = f.Audit.create; let injected = false;
  f.Audit.create = async function (...args) {
    const value = await original.apply(this,args);
    if (!injected) { injected = true; const error = new f.mongoose.mongo.MongoServerError({ message: 'INJECTED', code: 112 }); error.addErrorLabel('TransientTransactionError'); throw error; }
    return value;
  };
  try { await f.cancel(o.id,200,true); } finally { f.Audit.create = original; }
  assert.equal(injected, true); await count(o); assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 6);
});
test('CANCEL release vs nova reserva: Stock zero, sem saldo duplicado ou negativo', async () => {
  await f.Product.updateOne({ _id: f.data.products[0]._id }, { $set: { Stock: 1 } }); const a = await f.create(1,f.customer,1);
  assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock, 0);
  const [cancelled, created] = await Promise.all([f.cancel(a.id), f.h.request('POST','/order/new', { shippingInfo: f.shippingInfo, orderItems: [{ product: f.data.products[0].id, quantity: 1 }] }, f.other, undefined, { 'Idempotency-Key': crypto.randomUUID() })]);
  assert.equal(cancelled.status,200); assert.ok([201,409].includes(created.status));
  let reserved = created;
  if (created.status === 409) reserved = await f.h.request('POST','/order/new', { shippingInfo: f.shippingInfo, orderItems: [{ product: f.data.products[0].id, quantity: 1 }] }, f.other,201,{ 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(reserved.result.order.inventoryStatus,'RESERVED'); assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock,0);
  assert.equal((await f.artifacts(a.id)).releases,1);
});
test('CANCEL release vs ajuste absoluto F037 é serializável e ledger fecha cada delta', async () => {
  const o = await f.create(); const p = f.data.products[0];
  await Promise.all([f.cancel(o.id), f.h.request('PUT','/product/' + p.id,{ Stock:10 },f.admin,200)]);
  const stock = (await f.Product.findById(p._id)).Stock; assert.ok([10,12].includes(stock));
  const rows = await f.Movement.find({ product:p._id, type: { $in: ['RELEASE','ADMIN_ADJUSTMENT'] } }).lean();
  for (const row of rows) assert.equal(row.stockAfter, row.stockBefore + row.delta);
  const latest = rows.filter(r=>r.reason==='ORDER_CANCELLED' && String(r.order)===o.id)[0]; assert.equal(latest.delta,2);
});
test('CANCEL vs archive mantém ambos os estados; reviews e dinheiro não se perdem', async () => {
  const o = await f.create(); await Promise.all([f.cancel(o.id), f.h.request('PATCH','/admin/order/' + o.id + '/archive',{},f.admin,200)]);
  const row = await f.raw().findOne({ _id:o.oid }); assert.equal(row.orderStatus,'Cancelled'); assert.equal(row.inventoryStatus,'RELEASED'); assert.ok(row.administrativeArchivedAt);
});
for (const change of ['payment','shipping']) test('CANCEL revalida estado após conflito ' + change, async () => {
  const o = await f.create(); const service = require('../backend/services/orderCancellationService').createOrderCancellationService();
  const original = f.mongoose.Query.prototype.exec; let enter, release;
  const ready = new Promise(r=>enter=r), held = new Promise(r=>release=r); let paused=false;
  f.mongoose.Query.prototype.exec = async function (...args) { if (!paused && this.op === 'findOneAndUpdate' && this.model.modelName === 'Order') { paused=true; enter(); await held; } return original.apply(this,args); };
  const pending = require('../backend/services/email/enqueue').domainTransaction(f.Order.db, session=>service.cancel({ id:o.id,actor:f.data.users.user._id,session }));
  const outcome = assert.rejects(pending, error=>error.code===(change==='payment'?'ORDER_REFUND_REQUIRED':'ORDER_RETURN_REQUIRED'));
  await ready; await f.raw().updateOne({ _id:o.oid }, { $set:change==='payment'?{ paymentStatus:'PAID',paidAt:new Date() }:{orderStatus:'Shipped'} }); release();
  try { await outcome; } finally { f.mongoose.Query.prototype.exec=original; }
  assert.deepEqual(await f.artifacts(o.id),{releases:0,events:0,audits:0}); assert.equal((await f.Product.findById(f.data.products[0]._id)).Stock,4);
});
