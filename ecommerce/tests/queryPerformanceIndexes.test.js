const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const mongoose = require('mongoose');
const fixture = require('./helpers/paginationFixture');
const { productProjection } = require('../backend/utils/listQueries');
const rows = []; let env;
before(async () => { env = await fixture.start({products:2000,orders:2000,users:1000}); });
after(async () => {
    const target=path.resolve(__dirname,'../../.local/perf-explain.json');
    fs.writeFileSync(target,JSON.stringify(rows,null,2));
    if(env) await env.stop();
});
function stages(value, result=[]) {
    if(value && typeof value==='object') { if(value.stage) result.push(value.stage); for(const item of Object.values(value)) stages(item,result); }
    return result;
}
function indexNames(value, result=[]) {
    if(value && typeof value==='object') { if(value.indexName) result.push(value.indexName); for(const item of Object.values(value)) indexNames(item,result); }
    return result;
}
async function explain(label, query, { bounded=true }={}) {
    const plan=await query.explain('executionStats'), stats=plan.executionStats, winning=plan.queryPlanner.winningPlan;
    rows.push({query:label,index:indexNames(winning),nReturned:stats.nReturned,totalKeysExamined:stats.totalKeysExamined,totalDocsExamined:stats.totalDocsExamined,stages:stages(winning)});
    assert.equal(stats.nReturned,25);
    assert.ok(stages(winning).includes('IXSCAN'),label);
    assert.ok(!stages(winning).includes('SORT'),label);
    assert.ok(!stages(winning).includes('COLLSCAN'),label);
    if(bounded) { assert.ok(stats.totalDocsExamined<=30,label); assert.ok(stats.totalKeysExamined<=35,label); }
}
for(const label of ['products latest','products category','products legacy category','orders customer','orders admin active','orders all','users active','users all','users legacy active']) test(label+' explain: IXSCAN sem SORT e custo de página',async()=>{
    const User=mongoose.models.User, recent={createdAt:-1,_id:-1};
    const queries={
        'products latest':()=>fixture.Product.find({}).select(productProjection),
        'products category':()=>fixture.Product.find({category_id:env.category._id}).select(productProjection),
        'products legacy category':()=>fixture.Product.find({category:env.category.name}).select(productProjection),
        'orders customer':()=>fixture.Order.find({user:env.user._id}).select(require('../backend/utils/orderList').fields),
        'orders admin active':()=>fixture.Order.find({administrativeArchivedAt:null}).select(require('../backend/utils/orderList').fields),
        'orders all':()=>fixture.Order.find({}).select(require('../backend/utils/orderList').fields),
        'users active':()=>User.find({accountStatus:'ACTIVE'}).select('_id name email accountStatus'),
        'users all':()=>User.find({}).select('_id name email accountStatus'),
        'users legacy active':()=>User.find(require('../backend/utils/userLifecycle').activeFilter()).select('_id name email accountStatus'),
    };
    await explain(label,queries[label]().sort(recent).limit(25));
});
test('offset examina no máximo skip + limit; sem sort em memória',async()=>{
    const plan=await fixture.Product.find({}).sort({createdAt:-1,_id:-1}).skip(1000).limit(25).explain('executionStats');
    assert.equal(plan.executionStats.nReturned,25); assert.ok(plan.executionStats.totalKeysExamined<=1025);
    assert.ok(!stages(plan.queryPlanner.winningPlan).includes('SORT'));
    rows.push({query:'products offset1000',index:indexNames(plan.queryPlanner.winningPlan),nReturned:plan.executionStats.nReturned,totalKeysExamined:plan.executionStats.totalKeysExamined,totalDocsExamined:plan.executionStats.totalDocsExamined});
});
test('substring literal preserva semântica; residual scan fica registrado',async()=>{
    const plan=await fixture.Product.find({name:{$regex:'não existe literal',$options:'i'}}).sort({createdAt:-1,_id:-1}).limit(25).explain('executionStats');
    assert.equal(plan.executionStats.nReturned,0); assert.equal(plan.executionStats.totalDocsExamined,2000);
    rows.push({query:'substring sem resultado (residual F038)',index:indexNames(plan.queryPlanner.winningPlan),nReturned:0,totalKeysExamined:plan.executionStats.totalKeysExamined,totalDocsExamined:plan.executionStats.totalDocsExamined,stages:stages(plan.queryPlanner.winningPlan)});
});
test('projeção torna payload proporcional à página mesmo com descrição grande',async()=>{
    const result=(await env.request('GET','/admin/products?limit=25',null,200)).result;
    assert.equal(result.products.length,25); assert.ok(Buffer.byteLength(JSON.stringify(result))<20000);
});
test('categories: índice de árvore e prefixo por pai',async()=>{
    const categories=await fixture.Category.insertMany(Array.from({length:50},(_,i)=>({name:'Explain '+i,name_key:'explain '+i,parent_id:env.category._id})));
    await explain('categories tree',fixture.Category.find({}).sort({createdAt:1,_id:1}).limit(25));
    await explain('categories parent',fixture.Category.find({parent_id:env.category._id}).sort({createdAt:1,_id:1}).limit(25));
    assert.equal(categories.length,50);
});
test('addresses: índice completo suporta favorito e desempate',async()=>{
    const Address=mongoose.models.Address; await Address.init();
    await Address.insertMany(Array.from({length:50},(_,i)=>({user:env.user._id,label:'Explain '+i,...fixture.shippingInfo,favorite:i===0})));
    await explain('addresses customer',Address.find({user:env.user._id}).sort({favorite:-1,createdAt:-1,_id:-1}).limit(25));
});
test('audit: requestId usa índice composto e projeção F025',async()=>{
    const requestId=require('node:crypto').randomUUID();
    await fixture.Audit.insertMany(Array.from({length:50},()=>({eventVersion:1,requestId,actorUserId:env.admin._id,actorRole:'admin',action:'PRODUCT_CREATED',targetType:'PRODUCT',targetId:env.product._id,metadata:{},createdAt:new Date()})));
    await explain('audit request',fixture.Audit.find({requestId}).sort({createdAt:-1,_id:-1}).limit(25));
});
