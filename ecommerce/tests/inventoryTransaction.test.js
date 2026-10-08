const { markOrderPaidFixture } = require('./helpers/orderPaymentFixture');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { fork } = require('node:child_process');
const path = require('node:path');
const h = require('./authHarness');
const { fixtures, productData } = require('./fixtures');
const { testUri, startReplicaSet } = require('./replicaSetHarness');
const Product = require('../backend/models/productModel');
const Order = require('../backend/models/orderModel');
const Movement = require('../backend/models/stockMovementModel');
const Claim = require('../backend/models/orderIdempotencyModel');
const { requireTransactions, TransactionTopologyError } = require('../backend/config/mongoTransactions');
const { startServer } = require('../backend/server');
const { configFixture } = require('./configFixtures');
let data, cookie;
const shipping = { recipientName: 'Fixture', address: 'Rua Teste', number: '001A', complement: '', neighborhood: 'Centro',
    city: 'Curitiba', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' };
const payload = (qty = 1) => ({ shippingInfo: shipping, orderItems: [{ product: data.products[0].id, quantity: qty }] });
const post = (body = payload(), key = crypto.randomUUID(), expected) => h.request('POST', '/order/new', body, cookie, expected, { 'Idempotency-Key': key });
const stock = async (index = 0) => (await Product.findById(data.products[index].id)).Stock;
async function invariant(orders, movements, remaining) {
    assert.equal(await Order.countDocuments(), orders); assert.equal(await Movement.countDocuments(), movements);
    assert.equal(await stock(), remaining); assert.equal(await Claim.countDocuments({ status: 'COMPLETED' }), orders);
}
before(async () => { await h.start(); data = await fixtures(); cookie = await h.login(data.users.admin); });
after(h.stop);
beforeEach(async () => {
    await h.clearRateLimits(); await mongoose.connection.db.collection('orders').deleteMany({}); await Movement.deleteMany({}); await Claim.deleteMany({});
    await Product.updateMany({}, { $set: { Stock: 10, priceCents: 10000 } });
});
test('INV-01 topology real replica set suporta transações', async () => { await requireTransactions(); });
test('INV-02 standalone real recusa startup antes de prepare/listen sem dados sensíveis', async () => {
    const standalone = await startReplicaSet({ standalone: true });
    const connection = await mongoose.createConnection(standalone.base).asPromise();
    let listens = 0, prepares = 0;
    try {
        await assert.rejects(startServer(configFixture(), { createApp: () => ({ listen: () => { listens++; } }), connect: async () => {},
            requireTransactions: () => requireTransactions(connection), prepare: () => { prepares++; } }), error => {
                assert.equal(error.message, 'A API comercial exige MongoDB com suporte a transações.');
                assert.ok(!error.message.includes(standalone.base)); return error instanceof TransactionTopologyError;
            });
        assert.equal(listens, 0); assert.equal(prepares, 0);
    } finally { await connection.close(); await standalone.stop(); h.configure(); }
});
for (const [initial, requests, qty, successes, remaining] of [[1,2,1,1,0],[5,10,1,5,0],[5,2,3,1,2]]) {
    test(`INV concorrência Stock=${initial}, ${requests} intents distintas, qty=${qty}`, async () => {
        await Product.updateOne({ _id: data.products[0]._id }, { Stock: initial });
        const replies = await Promise.all(Array.from({ length: requests }, () => post(payload(qty))));
        assert.equal(replies.filter(r => r.status === 201).length, successes);
        assert.equal(replies.filter(r => r.status === 409 && r.result.code === 'ORDER_INSUFFICIENT_STOCK').length, requests - successes);
        await invariant(successes, successes, remaining);
        assert.equal(await Product.countDocuments({ Stock: { $lt: 0 } }), 0);
        console.log(JSON.stringify({ probe: 'inventory-concurrency', initial, requests, qty, success: successes, conflicts: requests-successes, orders: successes, movements: successes, remaining }));
    });
}
test('INV multi-product atômico, linhas reversas concorrentes e ledger exato', async () => {
    await Product.updateMany({}, { Stock: 1 });
    const body = payload(); body.orderItems.push({ product: data.products[1].id, quantity: 1 });
    const replies = await Promise.all([post(body), post({ ...body, orderItems: [...body.orderItems].reverse() })]);
    assert.deepEqual(replies.map(r => r.status).sort(), [201,409]); await invariant(1,2,0); assert.equal(await stock(1), 0);
    for (const movement of await Movement.find()) { assert.equal(movement.quantity, 1); assert.equal(movement.stockBefore,1); assert.equal(movement.stockAfter,0); }
});
test('INV revalida Stock dentro da transaction e reverte multi-product', async (t) => {
    const original = Claim.create.bind(Claim);
    t.mock.method(Claim,'create',async (...args) => { const record = await original(...args); await Product.updateOne({ _id: data.products[1]._id }, { Stock: 0 }); return record; });
    const body=payload(); body.orderItems.push({ product: data.products[1].id, quantity:1 });
    await post(body,crypto.randomUUID(),409); await invariant(0,0,10); assert.equal(await stock(1),0);
    assert.equal((await Claim.findOne()).status,'FAILED');
});
for (const point of ['first-product','all-reserves','after-movement','after-order','completion']) test(`INV rollback real: ${point}`, async (t) => {
    const body = payload(); body.orderItems.push({ product: data.products[1].id,quantity:1 });
    const originalMovement=Movement.create.bind(Movement), originalOrder=Order.create.bind(Order), originalComplete=Claim.updateOne.bind(Claim);
    if (point==='first-product') t.mock.method(Movement,'create',()=>{ throw new Error('INTERNAL_SENTINEL'); });
    if (point==='after-movement') t.mock.method(Movement,'create',async (...args)=>{ await originalMovement(...args); throw new Error('INTERNAL_SENTINEL'); });
    if (point==='all-reserves') t.mock.method(Order,'create',()=>{ throw new Error('INTERNAL_SENTINEL'); });
    if (point==='after-order') t.mock.method(Order,'create',async (...args)=>{ await originalOrder(...args); throw new Error('INTERNAL_SENTINEL'); });
    if (point==='completion') t.mock.method(Claim,'updateOne',(...args)=>{ if(args[1].$set?.status==='COMPLETED') throw new Error('INTERNAL_SENTINEL'); return originalComplete(...args); });
    const key=crypto.randomUUID(), reply=await post(body,key,503);
    assert.ok(!JSON.stringify(reply.result).includes('INTERNAL_SENTINEL')); await invariant(0,0,10); assert.equal(await stock(1),10);
    assert.equal((await Claim.findOne()).status,'PROCESSING');
    await post(body,key,409); await invariant(0,0,10);
});
test('INV transient write conflict reexecuta callback com ID estável e um único ledger', async (t) => {
    const original = Order.create.bind(Order); const ids=[];
    t.mock.method(Order,'create',async (...args)=>{
        ids.push(String(args[0][0]._id));
        if(ids.length===1) { const error=new mongoose.mongo.MongoServerError({ message:'WriteConflict',code:112 }); error.addErrorLabel('TransientTransactionError'); throw error; }
        return original(...args);
    });
    await post(payload(),crypto.randomUUID(),201); assert.equal(ids.length,2); assert.equal(ids[0],ids[1]); await invariant(1,1,9);
});
test('INV commit confirmado com resposta desconhecida é resolvido pelo driver sem reservar novamente', async (t) => {
    const start = mongoose.connection.startSession.bind(mongoose.connection);
    let commits = 0;
    t.mock.method(mongoose.connection, 'startSession', async (...args) => {
        const session = await start(...args), original = session.commitTransaction.bind(session);
        session.commitTransaction = async (...options) => {
            await original(...options);
            if (++commits === 1) {
                const error = new mongoose.mongo.MongoServerError({ message: 'Fixture commit response lost', code: 91 });
                error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
            }
        };
        return session;
    });
    const key = crypto.randomUUID(); await post(payload(), key, 201);
    assert.ok(commits >= 2); await post(payload(), key, 201); await invariant(1,1,9);
});
test('INV same-key 10 concorrentes/replays reserva uma vez e não expõe hashes/ledger', async () => {
    const key=crypto.randomUUID(); const first=await post(payload(),key,201);
    const replies=await Promise.all(Array.from({length:10},()=>post(payload(),key,201)));
    assert.ok(replies.every(r=>r.result.order._id===first.result.order._id)); await invariant(1,1,9);
    const json=JSON.stringify(first.result); for(const internal of ['stockBefore','stockAfter','idempotencyKeyHash','idempotencyRequestHash',key]) assert.ok(!json.includes(internal));
    assert.match(first.response.headers.get('cache-control'),/no-store/);
    const changed=payload(2); const conflict=await post(changed,key,409); assert.equal(conflict.result.code,'ORDER_IDEMPOTENCY_CONFLICT'); await invariant(1,1,9);
    assert.ok(!JSON.stringify(await Claim.find().lean()).includes(key));
});
test('INV corrida mesma key: recusa de catálogo após commit recupera Order em vez de encerrar tentativa', async () => {
    const key = crypto.randomUUID(); let entered, release;
    const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const service = require('../backend/services/orderIdempotencyService').createOrderIdempotencyService();
    const contender = service.execute({ user:data.users.admin._id,key,
        canonical:require('../shared/orderIntent.mjs').serializeOrderIntent(payload()),
        prepare:async()=>{ entered(); await gate; throw require('../backend/utils/inventory').insufficientStock(); },
        create:()=>{ throw new Error('Não deve repetir criação.'); },
    });
    try {
        await ready; const first = await post(payload(),key,201); release();
        const replay = await contender; assert.equal(String(replay.order._id),first.result.order._id); assert.equal(replay.replayed,true);
        await invariant(1,1,9);
    } finally { release(); await contender; }
});
test('INV inventory mass assignment, dinheiro e shipping continuam autoritativos', async () => {
    const reply=await post({...payload(3),inventoryStatus:'COMMITTED',inventoryVersion:999,inventoryReservedAt:'1970-01-01',movements:[],totalPriceCents:1},crypto.randomUUID(),201);
    const order=reply.result.order; assert.equal(order.inventoryStatus,'RESERVED'); assert.equal(order.inventoryVersion,1);
    assert.equal(order.paymentInfo.status,'Pending'); assert.equal(order.totalPriceCents,30000); assert.equal(order.shippingInfo.number,'001A');
    assert.equal(order.shippingInfo.pinCode,'01234567'); assert.equal(order.shippingInfo.phoneNo,'04123456789');
    const movement=await Movement.findOne(); assert.equal(movement.quantity,3); assert.equal(movement.stockBefore,10); assert.equal(movement.stockAfter,7);
    const duplicate = movement.toObject(); delete duplicate._id;
    await assert.rejects(Movement.create(duplicate),error=>error.code===11000 && error.keyPattern.order===1 && error.keyPattern.product===1 && error.keyPattern.type===1);
});
test('INV shipping não reduz estoque e DELETE RESERVED preserva tudo', async () => {
    const {result}=await post(payload(),crypto.randomUUID(),201); const route='/admin/order/'+result.order._id;
    await markOrderPaidFixture(result.order._id);
    await h.request('PUT',route,{status:'Shipped'},cookie,200); await invariant(1,1,9);
    await h.request('PUT',route,{status:'Delivered'},cookie,200); await invariant(1,1,9);
    await h.request('DELETE',route,null,cookie,405); await invariant(1,1,9);
});
test('INV legado sem inventário exige pagamento e envio não modifica Stock', async () => {
    const {result}=await post(payload(),crypto.randomUUID(),201);
    await Order.collection.updateOne({_id:new mongoose.Types.ObjectId(result.order._id)},{$unset:{inventoryStatus:1,inventoryVersion:1,inventoryReservedAt:1}});
    await h.request('GET','/order/'+result.order._id,null,cookie,200);
    await h.request('PUT','/admin/order/'+result.order._id,{status:'Shipped'},cookie,409);
    await markOrderPaidFixture(result.order._id);
    await h.request('PUT','/admin/order/'+result.order._id,{status:'Shipped'},cookie,200); assert.equal(await stock(),9);
});
for(const invalid of [true,'10',1.5,-1,null,Number.MAX_SAFE_INTEGER+1]) test(`INV admin rejeita Stock ${JSON.stringify(invalid)} antes do casting`,async()=>{
    await h.request('POST','/product/new',productData({Stock:invalid}),cookie,400);
    await h.request('PUT','/product/'+data.products[0].id,{Stock:invalid},cookie,400); assert.equal(await stock(),10);
});
for(const valid of [0,1,10]) test(`INV admin aceita Stock ${valid}`,async()=>{
    await h.request('PUT','/product/'+data.products[0].id,{Stock:valid},cookie,200); assert.equal(await stock(),valid);
});
for(const invalid of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'10',true]) test(`INV checkout recusa Stock legado inválido ${invalid}`,async()=>{
    await Product.collection.updateOne({_id:data.products[0]._id},{$set:{Stock:invalid}});
    await post(payload(),crypto.randomUUID(),409); assert.equal(await Order.countDocuments(),0); assert.equal(await Movement.countDocuments(),0);
    assert.equal((await Product.collection.findOne({_id:data.products[0]._id})).Stock,invalid);
});
test('INV checkout inválido/auth/CSRF não criam claim nem reserva',async()=>{
    for(const quantity of [true,'1',0,1.5]) await post(payload(quantity),crypto.randomUUID(),400);
    await post({...payload(),shippingInfo:{...shipping,pinCode:1234567}},crypto.randomUUID(),400);
    await h.request('POST','/order/new',payload(),null,401,{'Idempotency-Key':crypto.randomUUID()});
    await h.request('POST','/order/new',payload(),cookie,403,{'Idempotency-Key':crypto.randomUUID(),'X-Fetech-CSRF':''});
    assert.equal(await Claim.countDocuments(),0); await invariant(0,0,10);
});
test('INV duas APIs em processos diferentes disputam última unidade',async()=>{
    await Product.updateOne({_id:data.products[0]._id},{Stock:1});
    const worker=fork(path.join(__dirname,'helpers/orderIdempotencyWorker.js'),[],{env:{...process.env},silent:true,windowsHide:true});
    try {
        const ready=await new Promise((resolve,reject)=>{worker.once('message',m=>m.error?reject(new Error(m.error)):resolve(m));worker.once('error',reject);worker.once('exit',()=>reject(new Error('Worker indisponível')));});
        const replies=await Promise.all([post(),fetch(`http://127.0.0.1:${ready.port}/api/v1/order/new`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Fetech-CSRF':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload())}).then(async r=>({status:r.status,result:await r.json()}))]);
        assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);await invariant(1,1,0);
    } finally {if(worker.connected){const exited=new Promise(resolve=>worker.once('exit',resolve));worker.send('stop');await exited;}}
});
test('INV crash de processo após writes não persiste Order/movement/Stock',async()=>{
    const worker=fork(path.join(__dirname,'helpers/inventoryCrashWorker.js'),[],{env:{...process.env,DB_URI:testUri(h.database),FETECH_FIXTURE_PRODUCT:data.products[0].id},silent:true,windowsHide:true});
    let sessionId;
    try {sessionId=await new Promise((resolve,reject)=>{worker.once('message',m=>m.ready?resolve(m.sessionId):reject(new Error('Crash fixture indisponível')));worker.once('error',reject);worker.once('exit',()=>reject(new Error('Crash fixture encerrou cedo')));});}
    finally {const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGKILL');await exited;}
    await invariant(0,0,10);
    // Libera locks órfãos depois das asserções, apenas no replica set temporário.
    await mongoose.connection.db.admin().command({killSessions:[{id:new mongoose.mongo.Binary(Buffer.from(sessionId,'base64'),4)}]});
});
