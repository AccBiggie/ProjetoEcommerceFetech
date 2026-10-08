const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { testUri } = require('./replicaSetHarness');
const { auditInventory } = require('../backend/utils/inventoryAudit');
const database = `fetech_inventory_audit_${process.pid}_${Date.now()}`;
const names = ['products','orders','stockmovements','orderidempotencies'];
let logs;
before(async()=>{await mongoose.connect(testUri(database),{autoCreate:false,autoIndex:false});});
after(async()=>{try{assert.equal(mongoose.connection.name,database);await mongoose.connection.dropDatabase();}finally{await mongoose.disconnect();}});
beforeEach(async()=>{logs=[];for(const name of names)await mongoose.connection.collection(name).deleteMany({});});
const run=()=>auditInventory(mongoose.connection,{write:line=>logs.push(line)});
async function fixture(){
    const product=new mongoose.Types.ObjectId(),order=new mongoose.Types.ObjectId();
    await mongoose.connection.collection('products').insertOne({_id:product,Stock:7});
    await mongoose.connection.collection('orders').insertOne({_id:order,inventoryStatus:'RESERVED',inventoryVersion:1,
        orderItems:[{product,quantity:3}],shippingInfo:{address:'PII_ADDRESS',phoneNo:'PII_PHONE'},user:'PII_USER',paymentInfo:{id:'PII_PAYMENT'}});
    await mongoose.connection.collection('stockmovements').insertOne({product,order,type:'RESERVE',quantity:3,stockBefore:10,stockAfter:7});
    await mongoose.connection.collection('orderidempotencies').insertOne({status:'COMPLETED',order,keyHash:'HASH_SENTINEL'});
    return {product,order};
}
const snapshot=async()=>{const result={};for(const name of names)result[name]=await mongoose.connection.collection(name).find().sort({_id:1}).toArray();return result;};
test('AUD-01 dados coerentes e legado sem baseline não são classificados inválidos',async()=>{
    await fixture();await mongoose.connection.collection('orders').insertOne({orderItems:[]});assert.equal((await run()).issues.length,0);
});
for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1,true,'10',null])test(`AUD Stock inválido ${JSON.stringify(value)}`,async()=>{
    await mongoose.connection.collection('products').insertOne({Stock:value});assert.equal((await run()).issues[0].category,'INVALID_STOCK');
});
test('AUD-08 identifica reserva ausente',async()=>{await fixture();await mongoose.connection.collection('stockmovements').deleteMany({});assert.ok((await run()).issues.some(i=>i.category==='MISSING_RESERVE'));});
test('AUD-09 identifica movement órfão e claim COMPLETED sem Order',async()=>{await fixture();await mongoose.connection.collection('orders').deleteMany({});const categories=(await run()).issues.map(i=>i.category);assert.ok(categories.includes('ORPHAN_MOVEMENT'));assert.ok(categories.includes('COMPLETED_WITHOUT_ORDER'));});
test('AUD-10 identifica quantity divergente e before/after incoerentes',async()=>{await fixture();await mongoose.connection.collection('stockmovements').updateMany({},{$set:{quantity:2}});const categories=(await run()).issues.map(i=>i.category);assert.ok(categories.includes('QUANTITY_MISMATCH'));assert.ok(categories.includes('INCOHERENT_MOVEMENT'));});
test('AUD-11 duplicate movement e item inesperado detectados sem índice artificial',async()=>{
    const {order}=await fixture();const m=await mongoose.connection.collection('stockmovements').findOne();delete m._id;
    await mongoose.connection.collection('stockmovements').insertOne(m);
    delete m._id;
    await mongoose.connection.collection('stockmovements').insertOne({...m,order,product:new mongoose.Types.ObjectId()});
    const categories=(await run()).issues.map(i=>i.category);assert.ok(categories.includes('DUPLICATE_MOVEMENT'));assert.ok(categories.includes('UNEXPECTED_MOVEMENT'));
});
test('AUD-12 novo protocolo sem inventoryStatus detectado',async()=>{await fixture();await mongoose.connection.collection('orders').updateMany({},{$unset:{inventoryStatus:1}});assert.ok((await run()).issues.some(i=>i.category==='MISSING_INVENTORY_STATUS'));});
test('AUD-13 documentos antes/depois idênticos e nenhuma PII/hash impresso',async()=>{
    await fixture();const previous=await snapshot();await run();assert.deepEqual(await snapshot(),previous);
    for(const sentinel of ['PII_ADDRESS','PII_PHONE','PII_USER','PII_PAYMENT','HASH_SENTINEL'])assert.ok(!logs.join('').includes(sentinel));
});
test('AUD-14 CLI rejeita argumentos de escrita sem conectar',async()=>{
    const result = require('node:child_process').spawnSync(process.execPath, [require('node:path').resolve(__dirname,'../backend/scripts/auditInventory.js'),'--apply'], { encoding:'utf8',windowsHide:true,timeout:10000 });
    assert.equal(result.status,1); assert.ok(result.stderr.includes('somente leitura'));
});
test('AUD-15 CLI real usa perfil mínimo e só lê o banco temporário',async()=>{
    await fixture(); await mongoose.connection.collection('products').updateMany({},{$set:{Stock:-1}});
    const previous = await snapshot();
    const result = require('node:child_process').spawnSync(process.execPath,[require('node:path').resolve(__dirname,'../backend/scripts/auditInventory.js')], {
        env:{...process.env,NODE_ENV:'test',DB_URI:testUri(database)},encoding:'utf8',windowsHide:true,timeout:15000,
    });
    assert.equal(result.status,0); assert.ok(result.stdout.includes('READ_ONLY')); assert.ok(result.stdout.includes('INVALID_STOCK'));
    assert.ok(!result.stdout.includes('PII_')); assert.deepEqual(await snapshot(),previous);
});
