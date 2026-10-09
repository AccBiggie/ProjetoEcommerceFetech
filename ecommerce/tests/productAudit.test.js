const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const { start, Product, Movement, Category, productData } = require('./helpers/productHarness');
const { auditProducts } = require('../backend/utils/productAudit');
let h;
before(async()=>{h=await start();});
after(async()=>{if(h)await h.stop();});
async function snapshot() {
    const result={};
    for(const c of await mongoose.connection.db.listCollections().toArray())result[c.name]={rows:await mongoose.connection.db.collection(c.name).find().sort({_id:1}).toArray(),indexes:await mongoose.connection.db.collection(c.name).listIndexes().toArray()};
    return result;
}
test('CAT audit sees all incoherent historical states without writing or leaking PII',async()=>{
    const p=(await h.create()).result.product;
    const cases=[
        [{priceCents:-1},'PRODUCT_PRICE_INVALID'],[{oldPriceCents:1},'PRODUCT_OLD_PRICE_INVALID'],[{off:99},'PRODUCT_DISCOUNT_MISMATCH'],[{installmmentPriceCents:1},'PRODUCT_INSTALLMENT_MISMATCH'],
        [{Stock:-1},'PRODUCT_STOCK_INVALID'],[{category:'Divergent'},'PRODUCT_CATEGORY_MISMATCH'],[{category_id:new mongoose.Types.ObjectId()},'PRODUCT_CATEGORY_MISSING'],
        [{numOfReviews:999},'PRODUCT_REVIEW_COUNT_MISMATCH'],[{ratings:5},'PRODUCT_REVIEW_RATING_MISMATCH'],[{images:[{public_id:'unsafe',url:'javascript:PRIVATE_URL',banner:'/Profile.png'}]},'PRODUCT_IMAGE_INVALID'],
        [{images:[{public_id:'same',url:'/Profile.png',banner:'/Profile.png'},{public_id:'same',url:'/Profile.png',banner:'/Profile.png'}]},'PRODUCT_IMAGE_DUPLICATE'],[{Stock:99},'PRODUCT_LEDGER_MISMATCH']
    ];
    const original=await Product.collection.findOne({_id:new mongoose.Types.ObjectId(p._id)});
    for(const [fields,code] of cases) {
        await Product.collection.updateOne({_id:original._id},{$set:fields});
        const before=await snapshot(),logs=[];
        const result=await auditProducts(Product.db,{write:line=>logs.push(line)});
        assert.ok(result.issues.some(i=>i.productId===p._id&&i.code===code),code);
        assert.deepEqual(await snapshot(),before);assert.doesNotMatch(logs.join('\n'),/PRIVATE_URL|Produto temporário|https?:|recipient|password|email/);
        await Product.collection.replaceOne({_id:original._id},original);
    }
    await h.healthy();
});
test('CAT legacy ledger without complete baseline is reported as legacy, not a false mismatch',async()=>{
    const p=await Product.create(productData({Stock:17,category_id:h.category._id,category:h.category.name,user:h.admin._id}));
    const report=await auditProducts(Product.db,{write(){}});
    assert.equal(report.summary.legacyLedgerProducts,1);assert.ok(!report.issues.some(i=>i.productId===String(p._id)&&i.code==='PRODUCT_LEDGER_MISMATCH'));
    await h.update(p._id,{Stock:20});await h.update(p._id,{Stock:15});
    const rows=await Movement.find({product:p._id}).lean();assert.deepEqual(rows.map(m=>m.delta),[3,-5]);assert.equal(rows[0].stockBefore,17);
    await h.healthy();
});
test('CAT raw legacy decimals remain readable without a read-side write',async()=>{
    const raw={...require('./fixtures').legacyProductData({price:'19.90',oldPrice:'29.90',installmmentPrice:'1.66'}),category_id:h.category._id};
    const insert=await Product.collection.insertOne(raw),before=await snapshot();
    const result=await h.h.request('GET','/product/'+insert.insertedId,null,null,200);
    assert.equal(result.result.product.priceCents,1990);assert.equal(result.result.product.installmmentPriceCents,166);assert.equal(result.result.product.moneyLegacy,true);
    assert.deepEqual(await snapshot(),before);await Product.collection.deleteOne({_id:insert.insertedId});
});
test('CAT malformed and orphan movements detected using raw data',async()=>{
    const p=(await h.create()).result.product;
    const ids=await Movement.collection.insertMany([{product:new mongoose.Types.ObjectId(p._id),type:'ADMIN_ADJUSTMENT',delta:2,stockBefore:1,stockAfter:9},{product:new mongoose.Types.ObjectId(),type:'RESERVE',quantity:1,stockBefore:1,stockAfter:0}]);
    const report=await auditProducts(Product.db,{write(){}});assert.ok(report.issues.some(i=>i.code==='PRODUCT_LEDGER_MISMATCH'));assert.ok(report.issues.some(i=>i.code==='PRODUCT_LEDGER_ORPHAN'));
    await Movement.collection.deleteMany({_id:{$in:Object.values(ids.insertedIds)}});
});
async function cli(args=[]) {
    return new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,['backend/scripts/auditProducts.js',...args],{windowsHide:true,env:{...process.env,DB_URI:mongoose.connection.client.s.url,HOST:'partial-invalid',PASSWORD:'',CLOUDINARY_NAME:'partial-invalid',CLOUDINARY_API_KEY:'',CLOUDINARY_API_SECRET:''},stdio:['ignore','pipe','pipe']});
        let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.once('error',reject);child.once('exit',code=>resolve({code,output}));
    });
}
test('CAT audit CLI uses minimum config, no provider/server/SMTP, no writes',async()=>{
    const before=await snapshot(),r=await cli();assert.equal(r.code,0);assert.match(r.output,/READ_ONLY/);assert.deepEqual(await snapshot(),before);
});
test('CAT audit rejects every repair/apply argument without writes',async()=>{
    const before=await snapshot();for(const args of [['--apply'],['--repair'],['--unknown']])assert.equal((await cli(args)).code,1);assert.deepEqual(await snapshot(),before);
});
test('CAT audit snapshot is coherent when adjustment commits between collection reads',async(t)=>{
    const p=(await h.create({Stock:10})).result.product;
    const collection=mongoose.connection.collection('categories'), original=collection.find.bind(collection);let committed=false;
    t.mock.method(collection,'find',(...args)=>({toArray:async()=>{
        if(!committed){committed=true;await h.update(p._id,{Stock:15});}
        return original(...args).toArray();
    }}));
    const report=await auditProducts(Product.db,{write(){}});assert.deepEqual(report.issues,[]);assert.equal((await Product.findById(p._id)).Stock,15);
});
test('CAT existing inventory/order/backup verification accepts administrative ledger',async()=>{
    const p=(await h.create({Stock:10})).result.product;await h.update(p._id,{Stock:15});
    assert.equal((await h.order(p._id)).status,201);
    assert.deepEqual((await require('../backend/utils/inventoryAudit').auditInventory(Product.db,{write(){}})).issues,[]);
    assert.deepEqual((await require('../backend/utils/orderHistoryAudit').auditOrders(Product.db,{write(){}})).issues,[]);
    assert.equal(Object.keys(await require('../backend/utils/backupVerification').criticalInvariants(Product.db.db)).length,0);
});
test('CAT stock index upgrade preserves reserves and permits multiple admin adjustments',async()=>{
    const database='fetech_stockindex_'+process.pid+'_'+Date.now();
    const connection=await mongoose.createConnection(require('./replicaSetHarness').testUri(database),{autoIndex:false,autoCreate:false}).asPromise();
    try {
        const collection=connection.collection('stockmovements');
        const reserve={product:new mongoose.Types.ObjectId(),order:new mongoose.Types.ObjectId(),type:'RESERVE',quantity:1,stockBefore:5,stockAfter:4,version:1};
        await collection.insertOne(reserve);
        await collection.createIndex({order:1,product:1,type:1},{unique:true,name:'one_order_product_movement'});
        const before=await collection.find().toArray();await require('../backend/utils/stockLedgerIndexes').upgradeStockLedgerIndex(connection);
        assert.deepEqual(await collection.find().toArray(),before);await require('../backend/utils/stockLedgerIndexes').upgradeStockLedgerIndex(connection);
        const admin={product:reserve.product,type:'ADMIN_ADJUSTMENT',delta:1,stockBefore:4,stockAfter:5};
        await collection.insertOne(admin);await collection.insertOne({...admin,_id:new mongoose.Types.ObjectId(),stockBefore:5,stockAfter:6});
        const indexes=await collection.listIndexes().toArray();assert.ok(!indexes.some(i=>i.name==='one_order_product_movement'));assert.ok(indexes.some(i=>i.name==='one_order_product_reserve'&&i.unique&&i.partialFilterExpression.type==='RESERVE'));
        await assert.rejects(collection.insertOne({...reserve,_id:new mongoose.Types.ObjectId()}),e=>e.code===11000);
    }finally{if(connection.name===database)await connection.dropDatabase();await connection.close();}
});
