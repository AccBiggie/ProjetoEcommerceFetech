const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { start, capture } = require('./helpers/observabilityHarness');
const Audit = require('../backend/models/adminAuditEventModel');
const Product = require('../backend/models/productModel');
const Category = require('../backend/models/categoryModel');
const Order = require('../backend/models/orderModel');
const { uuid } = require('../backend/observability/logger');
const { metadataFor } = require('../backend/observability/auditContract');
let env,h,data,admin,customer,sequence=0;
before(async()=>{
    env=await start();h=env.h;data=await require('./fixtures').fixtures();admin=await h.login(data.users.admin);customer=await h.login(data.users.user);
    for(const file of ['orderModel','orderIdempotencyModel','stockMovementModel'])await require('../backend/models/'+file).init();
});
after(async()=>{if(env)await env.stop();});
beforeEach(async()=>{
    h.configure({LOG_LEVEL:'error'});await h.clearRateLimits();
    // Fixture teardown bypass only, on the isolated test database. Runtime never exposes this operation.
    await mongoose.connection.db.collection('adminauditevents').deleteMany({});
});
const rid=r=>r.response.headers.get('x-request-id');
async function checkEvent(reply,action,target){
    const row=await Audit.findOne({requestId:rid(reply)}).lean();assert.ok(row,'Audit event expected');assert.equal(row.action,action);assert.equal(String(row.actorUserId),data.users.admin.id);assert.equal(row.actorRole,'admin');assert.equal(String(row.targetId),String(target));assert.equal(row.eventVersion,1);assert.ok(row.createdAt instanceof Date);assert.match(row.requestId,uuid);return row;
}
async function order(){
    await Product.updateOne({_id:data.products[0]._id},{$set:{Stock:100}});
    const body={shippingInfo:{recipientName:'PRIVATE_RECIPIENT_SENTINEL',address:'PRIVATE_ADDRESS_SENTINEL',number:'01A',complement:'',neighborhood:'Centro',city:'Curitiba',state:'PR',country:'Brasil',pinCode:'01234567',phoneNo:'04123456789'},orderItems:[{product:data.products[0].id,quantity:1}]};
    const r=await h.request('POST','/order/new',body,customer,201,{'Idempotency-Key':crypto.randomUUID()});return r.result.order._id;
}
const archive=(id,state=true)=>h.request('PATCH','/admin/order/'+id+(state?'/archive':'/unarchive'),{},admin,200);
const category=()=>h.request('POST','/admin/category',{name:'PRIVATE_CATEGORY_SENTINEL_'+(++sequence)},admin,201);
test('AUD-01 archive correlaciona header/log/audit com ator e metadata segura',async()=>{
    const id=await order();h.configure({LOG_LEVEL:'info'});const {result,logs,output}=await capture(()=>archive(id));
    const row=await checkEvent(result,'ORDER_ARCHIVED',id);assert.equal(row.targetType,'ORDER');assert.deepEqual(row.metadata,{archived:true});
    assert.ok(logs.some(log=>log.event==='http.request.completed'&&log.requestId===rid(result)));assert.ok(logs.some(log=>log.event==='admin.action.completed'&&log.requestId===rid(result)));
    assert.doesNotMatch(output+JSON.stringify(row),/PRIVATE_RECIPIENT_SENTINEL|PRIVATE_ADDRESS_SENTINEL/);assert.match(result.response.headers.get('cache-control'),/no-store/);
});
test('AUD-02 unarchive audita estado real',async()=>{const id=await order();await archive(id);const r=await archive(id,false);assert.deepEqual((await checkEvent(r,'ORDER_UNARCHIVED',id)).metadata,{archived:false});});
test('AUD-03 archive/unarchive repetidos não inventam mutações',async()=>{const id=await order();await archive(id);await archive(id);assert.equal(await Audit.countDocuments({action:'ORDER_ARCHIVED',targetId:id}),1);await archive(id,false);await archive(id,false);assert.equal(await Audit.countDocuments({action:'ORDER_UNARCHIVED',targetId:id}),1);});
test('AUD-04 status PAID possui metadata from/to e mesmo estado é no-op',async()=>{
    const id=await order();await require('./helpers/orderPaymentFixture').markOrderPaidFixture(id);
    const r=await h.request('PUT','/admin/order/'+id,{status:'Shipped'},admin,200);assert.deepEqual((await checkEvent(r,'ORDER_STATUS_CHANGED',id)).metadata,{from:'Processing',to:'Shipped'});
    await h.request('PUT','/admin/order/'+id,{status:'Shipped'},admin,200);assert.equal(await Audit.countDocuments({action:'ORDER_STATUS_CHANGED',targetId:id}),1);
});
test('AUD-05 PENDING não envia nem cria evento de sucesso',async()=>{const id=await order();await h.request('PUT','/admin/order/'+id,{status:'Shipped',paymentStatus:'PAID'},admin,409);assert.equal(await Audit.countDocuments(),0);assert.equal((await Order.findById(id)).orderStatus,'Processing');});
test('AUD-06 User role, update e desativação preservam IDs sem PII',async()=>{
    const user=await h.createUser();let r=await h.request('PUT','/admin/user/'+user.id,{role:'admin'},admin,200);assert.deepEqual((await checkEvent(r,'USER_ROLE_CHANGED',user.id)).metadata,{fromRole:'user',toRole:'admin'});
    r=await h.request('PUT','/admin/user/'+user.id,{name:'PRIVATE_NAME_SENTINEL',email:'PRIVATE_EMAIL_SENTINEL@example.test'},admin,200);assert.deepEqual((await checkEvent(r,'USER_UPDATED',user.id)).metadata,{changedFields:['email','name']});
    r=await h.request('PATCH','/admin/user/'+user.id+'/deactivate',null,admin,200);const row=await checkEvent(r,'USER_DEACTIVATED',user.id);assert.deepEqual(row.metadata,{fromStatus:'ACTIVE',toStatus:'DEACTIVATED'});assert.equal((await h.User.findById(user.id)).accountStatus,'DEACTIVATED');
    assert.doesNotMatch(JSON.stringify(await Audit.find().lean()),/PRIVATE_NAME_SENTINEL|PRIVATE_EMAIL_SENTINEL/);
});
test('AUD-07 Product CRUD audita campos de centavos e Stock sem valores',async()=>{
    let r=await h.request('POST','/product/new',require('./fixtures').productData({name:'PRIVATE_PRODUCT_SENTINEL',category_id:data.products[0].category_id}),admin,201);const id=r.result.product._id;await checkEvent(r,'PRODUCT_CREATED',id);
    r=await h.request('PUT','/product/'+id,{price:'127.99',Stock:13},admin,200);const event=await checkEvent(r,'PRODUCT_UPDATED',id);assert.deepEqual(event.metadata,{changedFields:['Stock','priceCents']});
    r=await h.request('DELETE','/product/'+id,null,admin,200);await checkEvent(r,'PRODUCT_DELETED',id);assert.doesNotMatch(JSON.stringify(await Audit.find().lean()),/PRIVATE_PRODUCT_SENTINEL|12799/);
});
test('AUD-08 Category CRUD e parent_id auditados sem nome',async()=>{
    let r=await category();const id=r.result.category._id;await checkEvent(r,'CATEGORY_CREATED',id);
    r=await h.request('PUT','/admin/category/'+id,{name:'PRIVATE_NEW_CATEGORY_SENTINEL_'+(++sequence),parent_id:data.products[0].category_id},admin,200);assert.deepEqual((await checkEvent(r,'CATEGORY_UPDATED',id)).metadata,{changedFields:['name','parent_id']});
    r=await h.request('DELETE','/admin/category/'+id,null,admin,200);await checkEvent(r,'CATEGORY_DELETED',id);assert.doesNotMatch(JSON.stringify(await Audit.find().lean()),/PRIVATE_CATEGORY_SENTINEL|PRIVATE_NEW_CATEGORY_SENTINEL/);
});
test('AUD-09 exclusão de review com privilégio admin também auditada',async()=>{
    const id=data.products[0].id;await h.request('PUT','/review',{productId:id,rating:4,comment:'PRIVATE_REVIEW_SENTINEL'},customer,200);
    const review=(await Product.findById(id)).reviews.find(row=>String(row.user)===data.users.user.id);
    const r=await h.request('DELETE','/reviews?productId='+id+'&id='+review.id,null,admin,200);assert.deepEqual((await checkEvent(r,'PRODUCT_REVIEW_DELETED',id)).metadata,{reviewId:review.id});
});
test('AUD-10 CSRF, 403, 404 e DELETE Order 405 não criam eventos',async()=>{
    await h.request('POST','/admin/category',{name:'PRIVATE'},admin,403,{'X-Fetech-CSRF':'bad'});
    await h.request('POST','/admin/category',{name:'PRIVATE'},customer,403);
    await h.request('DELETE','/admin/category/'+new mongoose.Types.ObjectId(),null,admin,404);
    const id=await order();await h.request('DELETE','/admin/order/'+id,null,admin,405);assert.equal(await Audit.countDocuments(),0);assert.ok(await Order.findById(id));
});
for(const operation of ['archive','status','user-update','user-deactivate','product-create','product-update','product-delete','category-create','category-update','category-delete','review-delete'])test('AUD audit insert falha: rollback '+operation,async()=>{
    let request,verify;
    if(operation==='archive'||operation==='status'){
        const id=await order();if(operation==='status')await require('./helpers/orderPaymentFixture').markOrderPaidFixture(id);
        request=()=>h.request(operation==='archive'?'PATCH':'PUT','/admin/order/'+id+(operation==='archive'?'/archive':''),operation==='archive'?{}:{status:'Shipped'},admin,500);
        verify=async()=>{const row=await Order.findById(id).select('+administrativeArchivedAt');assert.equal(row.orderStatus,'Processing');assert.equal(row.administrativeArchivedAt,null);};
    }else if(operation.startsWith('user-')){
        const user=await h.createUser();request=()=>h.request(operation==='user-deactivate'?'PATCH':'PUT','/admin/user/'+user.id+(operation==='user-deactivate'?'/deactivate':''),operation==='user-deactivate'?null:{role:'admin',name:'Changed'},admin,500);
        verify=async()=>{const row=await h.User.findById(user.id);assert.ok(row);assert.equal(row.role,'user');assert.equal(row.name,user.name);assert.equal(row.accountStatus,'ACTIVE');};
    }else if(operation==='product-create'){
        const name='Rollback product '+(++sequence);request=()=>h.request('POST','/product/new',require('./fixtures').productData({name,category_id:data.products[0].category_id}),admin,500);verify=async()=>assert.equal(await Product.countDocuments({name}),0);
    }else if(operation==='product-update'||operation==='product-delete'){
        const r=await h.request('POST','/product/new',require('./fixtures').productData({category_id:data.products[0].category_id}),admin,201),id=r.result.product._id;
        request=()=>h.request(operation==='product-delete'?'DELETE':'PUT','/product/'+id,operation==='product-delete'?null:{Stock:37},admin,500);verify=async()=>{const row=await Product.findById(id);assert.ok(row);assert.equal(row.Stock,r.result.product.Stock);};
    }else if(operation==='category-create'){
        const name='Rollback category '+(++sequence);request=()=>h.request('POST','/admin/category',{name},admin,500);verify=async()=>assert.equal(await Category.countDocuments({name}),0);
    }else if(operation==='category-update'||operation==='category-delete'){
        const r=await category(),id=r.result.category._id;request=()=>h.request(operation==='category-delete'?'DELETE':'PUT','/admin/category/'+id,operation==='category-delete'?null:{name:'Rollback renamed '+(++sequence)},admin,500);verify=async()=>{const row=await Category.findById(id);assert.ok(row);assert.equal(row.name,r.result.category.name);};
    }else{
        const id=data.products[0].id;await h.request('PUT','/review',{productId:id,rating:4,comment:'Fixture'},customer,200);const row=await Product.findById(id),review=row.reviews.find(r=>String(r.user)===data.users.user.id);
        request=()=>h.request('DELETE','/reviews?productId='+id+'&id='+review.id,null,admin,500);verify=async()=>assert.ok((await Product.findById(id)).reviews.id(review.id));
    }
    const count=await Audit.countDocuments(),original=Audit.create;Audit.create=async()=>{throw new Error('PRIVATE_AUDIT_FAILURE_SENTINEL');};
    try{await capture(request);await verify();assert.equal(await Audit.countDocuments(),count);}finally{Audit.create=original;}
});
for(const method of ['updateOne','updateMany','findOneAndUpdate','replaceOne','deleteOne','deleteMany','findOneAndDelete','findOneAndReplace'])test('AUD append-only bloqueia '+method,async()=>{
    await category();const before=JSON.stringify(await Audit.find().lean());const update=['replaceOne','findOneAndReplace'].includes(method)?{}:{$set:{actorRole:'user'}};
    await assert.rejects(Audit[method]({},update),/append-only/);assert.equal(JSON.stringify(await Audit.find().lean()),before);
});
test('AUD append-only bloqueia save/delete documento, bulkWrite e aggregate output',async()=>{
    await category();const doc=await Audit.findOne();doc.metadata={};await assert.rejects(doc.save(),/append-only/);await assert.rejects(doc.deleteOne(),/append-only/);
    await assert.rejects(Audit.bulkWrite([{deleteMany:{filter:{}}}]),/append-only/);await assert.rejects(Audit.aggregate([{$match:{}},{$out:'audit_copy'}]),/append-only/);
});
test('AUD audit model sem TTL e índices de consultas definidos',async()=>{
    const indexes=await Audit.listIndexes();assert.ok(indexes.every(row=>row.expireAfterSeconds===undefined));
    for(const key of ['createdAt','action','targetType','actorUserId','requestId'])assert.ok(indexes.some(row=>row.key[key]!==undefined));
});
test('AUD sem endpoints para criar ou remover eventos',async()=>{await h.request('POST','/admin/audit-events',{},admin,404);await h.request('DELETE','/admin/audit-events',null,admin,404);});
test('AUD read API exige admin e usa no-store',async()=>{
    await h.request('GET','/admin/audit-events',null,null,401);await h.request('GET','/admin/audit-events',null,customer,403);
    const r=await h.request('GET','/admin/audit-events',null,admin,200);assert.match(r.response.headers.get('cache-control'),/no-store/);assert.deepEqual(r.result.pagination,{page:1,limit:25,total:0,pages:0});
});
test('AUD paginação real estável, default 25, máximo 100 e segunda página',async()=>{
    for(let i=0;i<28;i++)await category();const a=await h.request('GET','/admin/audit-events',null,admin,200),b=await h.request('GET','/admin/audit-events?page=2',null,admin,200);
    assert.equal(a.result.events.length,25);assert.equal(b.result.events.length,3);assert.equal(a.result.pagination.total,28);assert.equal(a.result.pagination.pages,2);
    assert.equal(new Set([...a.result.events,...b.result.events].map(row=>row._id)).size,28);
    for(let i=1;i<a.result.events.length;i++)assert.ok(a.result.events[i-1].createdAt>=a.result.events[i].createdAt);
    assert.equal((await h.request('GET','/admin/audit-events?limit=100',null,admin,200)).result.events.length,28);
});
for(const query of ['page=0','page=-1','page=abc','page=1.5','limit=0','limit=101','limit=1000','page=1&page=2','action[$ne]=x','actorUserId[$gt]=x','unknown=1','action=FAKE','targetType=FAKE','targetId=bad','requestId=bad','from=bad','from=2026-99-99T00:00:00.000Z','from=2026-10-09T00:00:00.000Z&to=2026-10-08T00:00:00.000Z'])test('AUD read rejeita query '+query,async()=>{await h.request('GET','/admin/audit-events?'+query,null,admin,400);});
test('AUD filtros action/target/actor/requestId/datas e DTO explícito sem populate',async()=>{
    const r=await category(),id=r.result.category._id;await category();
    const filtered=await h.request('GET','/admin/audit-events?action=CATEGORY_CREATED&targetType=CATEGORY&targetId='+id+'&actorUserId='+data.users.admin.id+'&requestId='+rid(r)+'&from=2020-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z',null,admin,200);
    assert.equal(filtered.result.events.length,1);const row=filtered.result.events[0];assert.equal(row.requestId,rid(r));assert.equal(row.actorUserId,data.users.admin.id);assert.doesNotMatch(JSON.stringify(row),/PRIVATE_CATEGORY_SENTINEL|email|password|token|shipping/);
});
test('AUD metadata allowlist rejeita PII, secret, campos/valores arbitrários',()=>{
    for(const metadata of [{email:'PRIVATE_SENTINEL'},{from:'PRIVATE_SENTINEL'},{changedFields:['password']}])assert.throws(()=>metadataFor('ORDER_STATUS_CHANGED',metadata));
    assert.throws(()=>metadataFor('PRODUCT_UPDATED',{changedFields:['password']}));assert.throws(()=>metadataFor('USER_ROLE_CHANGED',{fromRole:'PRIVATE_SENTINEL'}));
});
test('AUD payload não forja ator, ação, timestamp, metadata ou requestId',async()=>{
    const r=await h.request('POST','/admin/category',{name:'Forged '+(++sequence),requestId:crypto.randomUUID(),actorUserId:new mongoose.Types.ObjectId(),createdAt:'2000-01-01',metadata:{secret:'PRIVATE_SENTINEL'},action:'USER_DELETED'},admin,201);
    const row=await checkEvent(r,'CATEGORY_CREATED',r.result.category._id);assert.ok(row.createdAt.getFullYear()>=2026);assert.deepEqual(row.metadata,{});
});
test('AUD rollback inclui denormalização Product.category junto à categoria',async()=>{
    const created=await category(),categoryId=created.result.category._id;
    const product=await h.request('POST','/product/new',require('./fixtures').productData({category_id:categoryId}),admin,201);
    const original=Audit.create;Audit.create=async()=>{throw new Error('Audit insert unavailable');};
    try{await capture(()=>h.request('PUT','/admin/category/'+categoryId,{name:'Rollback denormalization '+(++sequence)},admin,500));
        assert.equal((await Category.findById(categoryId)).name,created.result.category.name);
        assert.equal((await Product.findById(product.result.product._id)).category,created.result.category.name);
    }finally{Audit.create=original;}
});
test('AUD middleware de queries e bulk sem middleware não permitem bypass',async()=>{
    await category();await assert.rejects(Audit.find().updateMany({actorRole:'user'}),/append-only/);
    await assert.rejects(Audit.bulkWrite([{deleteMany:{filter:{}}}],{middleware:false}),/append-only/);
});
