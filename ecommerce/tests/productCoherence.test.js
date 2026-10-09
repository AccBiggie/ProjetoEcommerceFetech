const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const domain = require('../backend/utils/productDomain');
const money = require('../backend/utils/money');
const { start, Product, Movement, Category, Order, Audit, productData } = require('./helpers/productHarness');
let h;
before(async () => { h = await start(); });
after(async () => { if (h) await h.stop(); });
const counts = async () => Promise.all([Product.countDocuments(), Movement.countDocuments(), Audit.countDocuments()]);
for (const [label, price] of [['precision','10.001'], ['negative',-1], ['NaN',NaN], ['Infinity',Infinity], ['boolean',true], ['array',[]], ['object',{}], ['overflow','90071992547409.92'], ['whitespace',' 10'], ['scientific','1e2']]) {
    test('CAT money rejects ' + label + ' without partial commit', async () => {
        const before = await counts(); await h.create({ price }, 400); assert.deepEqual(await counts(), before);
    });
}
test('CAT zero commercial price and safe integer limit remain supported', async () => {
    for (const price of ['0.00', '90071992547409.91']) {
        const p = (await h.create({ price })).result.product;
        assert.equal(p.priceCents, money.parseMoneyToCents(price));
        assert.equal(p.installmmentPriceCents, money.splitInstallments(p.priceCents,12)[0]);
        assert.equal(money.sumCents(money.splitInstallments(p.priceCents,12)),p.priceCents);
    }
});
test('CAT old price, rounding, equal price, removing reference and updates', async () => {
    const p=(await h.create({price:'75.00',oldPrice:'100.00'})).result.product;
    assert.equal(p.off,25); assert.equal(p.installmmentPriceCents,625);
    assert.equal((await h.update(p._id,{price:'50.00'})).result.product.off,50);
    assert.equal((await h.update(p._id,{oldPrice:'200.00'})).result.product.off,75);
    assert.equal((await h.update(p._id,{oldPrice:'50.00'})).result.product.off,0);
    const noOld=(await h.update(p._id,{oldPrice:null})).result.product;
    assert.equal(noOld.oldPriceCents,null); assert.equal(noOld.oldPrice,null); assert.equal(noOld.off,0); assert.equal(noOld.moneyLegacy,false);
    for(const oldPrice of ['49.99','0.001',true,{},[]]) await h.update(p._id,{oldPrice},400);
    await h.healthy();
});
test('CAT exact BigInt percentage matches half-up policy at boundaries', () => {
    assert.equal(domain.commercial({priceCents:9950,oldPriceCents:10000}).off,1);
    assert.equal(domain.commercial({priceCents:Number.MAX_SAFE_INTEGER-1,oldPriceCents:Number.MAX_SAFE_INTEGER}).off,0);
});
for(const field of ['_id','__v','createdAt','updatedAt','user','priceCents','oldPriceCents','installmmentPrice','installmmentPriceCents','off','reviews','ratings','numOfReviews','stockLedgerVersion','requestId','parent_id','$set','unknown']) test('CAT immutable field '+field+' rejects create/update',async()=>{
    const p=(await h.create()).result.product, before=await counts(), raw=await Product.findById(p._id).lean();
    assert.equal((await h.create({[field]:1},400)).result.code,'PRODUCT_FIELD_NOT_MUTABLE');
    assert.equal((await h.update(p._id,{[field]:1},400)).result.code,'PRODUCT_FIELD_NOT_MUTABLE');
    assert.deepEqual(await counts(),before); assert.deepEqual(await Product.findById(p._id).lean(),raw);
});
for(const Stock of [-1,1.5,'5',true,null,Number.MAX_SAFE_INTEGER+1]) test('CAT invalid stock '+JSON.stringify(Stock)+' is rejected',async()=>{
    const before=await counts(); await h.create({Stock},400); assert.deepEqual(await counts(),before);
});
test('CAT stock initial, zero, adjustments, unchanged stock and technical actor',async()=>{
    const zero=(await h.create({Stock:0})).result.product;
    assert.equal(await Movement.countDocuments({product:zero._id}),0);
    const p=(await h.create({Stock:10})).result.product;
    for(const Stock of [15,6,6]) await h.update(p._id,{Stock});
    const rows=await Movement.find({product:p._id}).sort({_id:1}).lean();
    assert.deepEqual(rows.map(m=>[m.type,m.delta,m.stockBefore,m.stockAfter]),[['INITIAL_STOCK',10,0,10],['ADMIN_ADJUSTMENT',5,10,15],['ADMIN_ADJUSTMENT',-9,15,6]]);
    assert.ok(rows.every(m=>String(m.actorUserId)===String(h.admin._id)&&m.order===undefined&&m.quantity===undefined));
    await h.healthy();
});
for(const failure of ['movement-create','movement-update','audit-create','audit-update']) test('CAT rollback on '+failure,async(t)=>{
    const p=(await h.create()).result.product, before=await counts(), raw=await Product.findById(p._id).lean();
    const Model=failure.startsWith('movement')?Movement:Audit, original=Model.create.bind(Model);
    t.mock.method(Model,'create',async(...args)=>{await original(...args);throw new Error('PRIVATE_FAILURE_SENTINEL');});
    const reply=failure.endsWith('create')?await h.create({name:'Never persists'},500):await h.update(p._id,{Stock:31,price:'19.90',name:'Never persists'},500);
    assert.doesNotMatch(JSON.stringify(reply.result),/PRIVATE_FAILURE_SENTINEL/);
    assert.deepEqual(await counts(),before); assert.deepEqual(await Product.findById(p._id).lean(),raw);
});
test('CAT transaction retry rolls back first attempt, one movement and audit survive',async(t)=>{
    const p=(await h.create({Stock:10})).result.product, events=await Audit.countDocuments(), original=Audit.create.bind(Audit);let attempts=0;
    t.mock.method(Audit,'create',async(...args)=>{
        if(++attempts===1){const e=new mongoose.mongo.MongoServerError({message:'WriteConflict',code:112});e.addErrorLabel('TransientTransactionError');throw e;}
        return original(...args);
    });
    await h.update(p._id,{Stock:15});assert.equal(attempts,2);assert.equal(await Movement.countDocuments({product:p._id,type:'ADMIN_ADJUSTMENT'}),1);assert.equal(await Audit.countDocuments(),events+1);await h.healthy();
});
test('CAT category name/ID coherent, mismatch and missing category rejected',async()=>{
    const c=await Category.create({name:'Categoria Á',name_key:'categoria á'});
    const p=(await h.create({category_id:String(c._id)})).result.product;
    assert.equal(p.category,c.name);assert.equal(p.category_id,String(c._id));
    assert.equal((await h.create({category:c.name})).result.product.category_id,String(c._id));
    assert.equal((await h.create({category_id:String(c._id),category:'Hardware'},400)).result.code,'PRODUCT_CATEGORY_MISMATCH');
    await h.create({category_id:'invalid'},400);await h.create({category_id:String(new mongoose.Types.ObjectId())},400);
    const changed=(await h.update(p._id,{category:'Hardware'})).result.product;assert.equal(changed.category_id,String(h.category._id));await h.healthy();
});
for(const field of ['name','description','countDown']) for(const value of ['', '   ', [], {}, true, 123]) test('CAT invalid text '+field+' '+JSON.stringify(value),async()=>{await h.create({[field]:value},400);});
test('CAT Unicode trimmed; duplicate names and no images remain supported',async()=>{
    const p=(await h.create({name:'  Pláca ™ 日本  ',description:'  descrição ç  ',images:[]})).result.product;
    assert.equal(p.name,'Pláca ™ 日本');assert.equal(p.description,'descrição ç');
    await h.create({name:p.name});await h.create({countDown:'x'.repeat(51)},400);
});
for(const images of [null,{},['bad'],[{public_id:'',url:'https://example.com/a',banner:'https://example.com/a'}], [{public_id:'id',url:'http://example.com/a',banner:'https://example.com/a'}], [{public_id:'id',url:'data:image/png;base64,a',banner:'/Profile.png'}], [{public_id:'id',url:'javascript:alert(1)',banner:'/Profile.png'}], [{public_id:'id',url:'//evil.example/a',banner:'/Profile.png'}], [{public_id:'id',url:'https://user:pass@example.com/a',banner:'/Profile.png'}], [{public_id:'id',url:'/demo-products/../x.png',banner:'/Profile.png'}], [{public_id:'id',url:'/Profile.png',banner:'/Profile.png',private:'sentinel'}]]) test('CAT invalid image metadata '+JSON.stringify(images),async()=>{await h.create({images},400);});
test('CAT duplicate image IDs rejected; HTTPS metadata accepted without provider',async()=>{
    const image={public_id:'id',url:'https://example.com/image.png',banner:'https://example.com/banner.png'};
    assert.equal((await h.create({images:[image,image]},400)).result.code,'PRODUCT_IMAGE_DUPLICATE');
    await h.create({images:[image]});
});
test('CAT delete preserves stock ledger and order history; unreferenced zero stock may be deleted',async()=>{
    const p=(await h.create()).result.product, order=(await h.order(p._id)).result.order, snapshot=await Order.findById(order._id).lean();
    await h.update(p._id,{name:'Nome novo',price:'199.99'});assert.deepEqual(await Order.findById(order._id).lean(),snapshot);
    assert.equal((await h.request('DELETE','/product/'+p._id,null,409)).result.code,'PRODUCT_IN_USE');
    const zero=(await h.create({Stock:0})).result.product;await h.request('DELETE','/product/'+zero._id,null,200);
    await h.request('DELETE','/product/'+zero._id,null,404);assert.equal(await Product.findById(zero._id),null);await h.healthy();
});
test('CAT routes preserve CSRF, authentication and authorization',async()=>{
    await h.h.request('POST','/product/new',productData(),null,401);
    await h.h.request('POST','/product/new',productData(),h.userCookie,403);
    await h.h.request('POST','/product/new',productData(),h.cookie,403,{'X-Fetech-CSRF':undefined});
    const p=(await h.create()).result.product;const r=await h.h.request('GET','/product/'+p._id,null,null,200);
    assert.equal(r.result.product.price,'100.00');assert.equal(r.result.product.installmmentPrice,'8.34');
});
test('CAT old ledger index fails closed without changing product/movement/audit',async(t)=>{
    // Read the old topology from a separate isolated temporary collection.
    // The HTTP guard receives its real native index metadata; no product writes are mocked.
    const database='fetech_oldindex_'+process.pid+'_'+Date.now();
    const connection=await mongoose.createConnection(require('./replicaSetHarness').testUri(database),{autoIndex:false,autoCreate:false}).asPromise();
    try {
        const collection=connection.collection('stockmovements');await collection.createIndex({order:1,product:1,type:1},{unique:true,name:'one_order_product_movement'});
        // The guard reads native index metadata; model/transaction writes stay real.
        const indexes=await collection.listIndexes().toArray();
        t.mock.method(Movement.collection,'listIndexes',()=>({toArray:async()=>indexes}));
        const p=await Product.findOne(), before=await counts(),raw=await Product.findById(p._id).lean();
        assert.equal((await h.create({},503)).result.code,'PRODUCT_STOCK_LEDGER_INDEX_REQUIRED');
        assert.equal((await h.update(p._id,{Stock:30},503)).result.code,'PRODUCT_STOCK_LEDGER_INDEX_REQUIRED');
        assert.deepEqual(await counts(),before);assert.deepEqual(await Product.findById(p._id).lean(),raw);
    }finally{if(connection.name===database)await connection.dropDatabase();await connection.close();}
});
