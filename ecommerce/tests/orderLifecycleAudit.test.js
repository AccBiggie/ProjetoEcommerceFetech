const { test, before, after } = require('node:test'); const assert = require('node:assert/strict');
const f = require('./helpers/orderCancellationFixture').fixture(); before(f.start); after(f.h.stop);
test('CANCEL AUDIT detecta invariantes, duplicatas e legado sem writes/PII/providers', async () => {
  await f.reset(); const o=await f.create(); await f.cancel(o.id);
  const audit = () => require('../backend/utils/orderHistoryAudit').auditOrders(f.mongoose.connection,{ lifecycle:true,write:line=>lines.push(line) }); let lines=[];
  assert.equal((await audit()).issues.length,0);
  const base=await f.raw().findOne({_id:o.oid}); const native=f.mongoose.connection.db;
  for (const [set,code] of [[{inventoryStatus:'RESERVED'},'ORDER_CANCELLED_WITH_RESERVED_INVENTORY'],[{cancelledAt:null},'ORDER_CANCELLED_WITHOUT_CANCELLED_AT'],[{shippedAt:new Date()},'ORDER_CANCELLED_WITH_SHIPPED_STATE'],[{deliveredAt:new Date()},'ORDER_CANCELLED_WITH_DELIVERED_STATE'],[{paymentStatus:'PAID'},'ORDER_CANCELLED_WITH_PAID_STATE'],[{inventoryVersion:null},'ORDER_LEGACY_INVENTORY_UNVERIFIED']]) {
    await f.raw().updateOne({_id:o.oid},{$set:{...set,shippingInfo:{address:'PRIVATE_SENTINEL'}}}); const before=await f.snapshot(); lines=[];
    assert.ok((await audit()).issues.some(i=>i.category===code)); assert.equal(await f.snapshot(),before); assert.doesNotMatch(lines.join(''),/PRIVATE_SENTINEL|routes\.example/);
    await f.raw().replaceOne({_id:o.oid},base);
  }
  const release=await f.Movement.findOne({order:o.id,type:'RELEASE'}).lean(); delete release._id; await native.collection('stockmovements').insertOne(release);
  assert.ok((await audit()).issues.some(i=>i.category==='ORDER_RELEASE_MOVEMENT_DUPLICATED'));
  await native.collection('stockmovements').deleteMany({order:o.oid,type:'RELEASE'}); await native.collection('emailoutboxes').deleteMany({entityId:o.oid,eventType:'ORDER_CANCELLED'});
  const result=await audit(); for(const code of ['ORDER_RELEASE_MOVEMENT_MISSING','ORDER_CANCEL_EVENT_MISSING']) assert.ok(result.issues.some(i=>i.category===code));
  const before=await f.snapshot(), original=native.collection.bind(native);
  native.collection=name=>{ const collection=original(name); return {find:collection.find.bind(collection)}; };
  try { await audit(); } finally { native.collection=original; }
  assert.equal(await f.snapshot(),before); assert.equal(result.summary.mode,'READ_ONLY');
});
