const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { fork } = require('node:child_process');
const path = require('node:path');
const { start, Product, Movement, Category, Audit, Order } = require('./helpers/productHarness');
let h;
before(async()=>{h=await start();});
after(async()=>{if(h)await h.stop();});
async function assertChain(id) {
    const rows=await Movement.find({product:id}).lean(), p=await Product.findById(id).lean();
    assert.ok(rows.every(require('../backend/utils/stockMovementContract').validMovement));
    assert.equal(rows.reduce((sum,m)=>sum+BigInt(m.type==='RESERVE'?-m.quantity:m.delta),0n),BigInt(p.Stock));
    assert.ok(p.Stock>=0);await h.healthy();
}
test('CAT admin absolute stock target vs reserve, repeated real transactions',async()=>{
    for(let i=0;i<10;i++) {
        const p=(await h.create({Stock:1})).result.product;
        const replies=await Promise.all([h.update(p._id,{Stock:10}),h.order(p._id)]);
        assert.deepEqual(replies.map(r=>r.status),[200,201]);
        assert.ok([9,10].includes((await Product.findById(p._id)).Stock));
        const adjust=await Movement.findOne({product:p._id,type:'ADMIN_ADJUSTMENT'}).lean();
        assert.equal(adjust.delta,10-adjust.stockBefore);assert.equal(adjust.stockAfter,10);
        assert.equal(await Movement.countDocuments({product:p._id,type:'RESERVE'}),1);await assertChain(p._id);
    }
});
test('CAT ten simultaneous reserves/adjustments never lose committed deltas',async()=>{
    const p=(await h.create({Stock:5})).result.product, events=await Audit.countDocuments();
    const replies=await Promise.all(Array.from({length:10},(_,i)=>i%2?h.order(p._id):h.update(p._id,{Stock:5+i})));
    assert.ok(replies.every(r=>[200,201,409].includes(r.status)));
    assert.equal(await Audit.countDocuments(),events+5);
    assert.equal(await Movement.countDocuments({product:p._id,type:'RESERVE'}),replies.filter(r=>r.status===201).length);await assertChain(p._id);
});
test('CAT price update vs reserve preserves both and a valid historical price',async()=>{
    const p=(await h.create({Stock:4})).result.product;
    const [updated,reserved]=await Promise.all([h.update(p._id,{price:'199.99'}),h.order(p._id)]);
    assert.equal(updated.status,200);assert.equal(reserved.status,201);
    const current=await Product.findById(p._id);assert.equal(current.priceCents,19999);assert.equal(current.Stock,3);
    assert.ok([10000,19999].includes(reserved.result.order.orderItems[0].priceCents));await assertChain(p._id);
});
test('CAT price/name update vs twenty reviews preserves all reviews and aggregates',async()=>{
    const p=(await h.create()).result.product;
    const users=await Promise.all(Array.from({length:20},()=>h.h.createUser()));
    const reviews=require('../backend/services/productReviewService');
    await Promise.all([h.update(p._id,{name:'Atualizado',price:'19.99'}),...users.map((user,i)=>reviews.upsert({productId:p._id,user,body:{rating:i%5+1,comment:'Review fixture'}}))]);
    const raw=await Product.findById(p._id).lean();assert.equal(raw.name,'Atualizado');assert.equal(raw.priceCents,1999);assert.equal(raw.numOfReviews,20);assert.equal(raw.ratings,3);
    assert.deepEqual(require('../backend/utils/reviewContract').assessReviews(raw),[]);await h.healthy();
});
for(const kind of ['create','category-update','name-update']) test('CAT category rename races '+kind+' without denormalization mismatch',async()=>{
    const c=await Category.create({name:'Race '+kind,name_key:'race '+kind});
    const p=kind==='create'?null:(await h.create({category_id:String(c._id)})).result.product;
    const next='Renamed '+kind;
    const replies=await Promise.all([h.request('PUT','/admin/category/'+c._id,{name:next},200),kind==='create'?h.create({category_id:String(c._id)}):h.update(p._id,kind==='category-update'?{category_id:String(c._id)}:{name:'Other name'})]);
    assert.ok(replies.every(r=>[200,201].includes(r.status)));
    const rows=await Product.find({category_id:c._id}).lean();assert.ok(rows.length);assert.ok(rows.every(p=>p.category===next));await h.healthy();
});
test('CAT failing category denormalization aborts category, revision and audit',async(t)=>{
    const c=await Category.create({name:'Atomic rename',name_key:'atomic rename'});
    const p=(await h.create({category_id:String(c._id)})).result.product;
    const State=require('../backend/models/categoryHierarchyStateModel'), before=await State.findById('category-hierarchy').lean(), events=await Audit.countDocuments();
    const original=Product.updateMany.bind(Product);
    t.mock.method(Product,'updateMany',async(...args)=>{await original(...args);throw new Error('sync failed');});
    await h.request('PUT','/admin/category/'+c._id,{name:'Should rollback'},500);
    assert.equal((await Category.findById(c._id)).name,c.name);assert.equal((await Product.findById(p._id)).category,c.name);
    assert.deepEqual(await State.findById('category-hierarchy').lean(),before);assert.equal(await Audit.countDocuments(),events);
});
test('CAT product delete vs reserve has no orphan',async()=>{
    // Legacy product without a ledger; both operations write the same Product.
    const p=await Product.create(require('./fixtures').productData({Stock:1,category_id:h.category._id,category:h.category.name,user:h.admin._id}));
    const replies=await Promise.all([h.request('DELETE','/product/'+p._id,null),h.order(p._id)]);
    assert.ok(replies.every(r=>[200,201,404,409,503].includes(r.status)),JSON.stringify(replies.map(r=>({status:r.status,code:r.result.code}))));
    if(replies[1].status===503)assert.equal(replies[1].result.code,'ORDER_TRANSACTION_UNAVAILABLE'); // F005 retains PROCESSING when Product disappears after preflight.
    const present=await Product.exists({_id:p._id}), orders=await Order.countDocuments({'orderItems.product':p._id}), movements=await Movement.countDocuments({product:p._id});
    assert.ok(present||orders===0&&movements===0);if(orders)assert.equal(replies[0].status,409);
});
test('CAT combined mutation vs category delete obeys hierarchy revision',async()=>{
    const c=await Category.create({name:'Delete race',name_key:'delete race'}),p=(await h.create()).result.product;
    const results=await Promise.all([h.request('PUT','/product/'+p._id,{category_id:String(c._id),Stock:12,price:'19.99'}),h.request('DELETE','/admin/category/'+c._id,null)]);
    assert.ok(results.every(r=>[200,400,409].includes(r.status)));
    const raw=await Product.findById(p._id).lean();if(String(raw.category_id)===String(c._id))assert.ok(await Category.exists({_id:c._id}));
    await assertChain(p._id);
});
test('CAT two independent API processes serialize targets and reservations',async()=>{
    const p=(await h.create({Stock:2})).result.product;
    const children=[], workers=[];
    try {
        for(let i=0;i<2;i++) {
            const child=fork(path.join(__dirname,'helpers/categoryHierarchyWorker.js'),[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,CATEGORY_TEST_URI:mongoose.connection.client.s.url}});
            children.push(child);
            workers.push(await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Worker startup timed out')),15000);child.once('message',message=>{clearTimeout(timer);resolve(message.base);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Worker exited'));});}));
        }
        const request=async(base,route,body,cookie)=>{
            const reply=await fetch(base+'/api/v1'+route,{method:route==='/order/new'?'POST':'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','X-Fetech-CSRF':'1','Idempotency-Key':require('node:crypto').randomUUID()},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
            return {status:reply.status,result:await reply.json()};
        };
        const replies=await Promise.all([request(workers[0],'/product/'+p._id,{Stock:10,price:'19.99'},h.cookie),request(workers[1],'/order/new',{shippingInfo:require('./helpers/productHarness').shippingInfo,orderItems:[{product:p._id,quantity:1}]},h.userCookie)]);
        assert.deepEqual(replies.map(r=>r.status),[200,201]);await assertChain(p._id);
        assert.equal((await Product.findById(p._id)).priceCents,1999);
        assert.equal(await Audit.countDocuments({action:'PRODUCT_UPDATED',targetId:p._id}),1);
    } finally {await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill();})));}
});
