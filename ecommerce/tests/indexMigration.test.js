const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const mongoose=require('mongoose');
const fixture=require('./helpers/productHarness');
const {inventory,migrate,argumentsFor}=require('../backend/utils/indexOperations');
const {manifest}=require('../backend/utils/queryIndexes');
let env;
before(async()=>{env=await fixture.start();});
after(async()=>{if(env) await env.stop();});
for(const args of [[],['--dry-run']]) test('migration dry-run default '+JSON.stringify(args),()=>assert.equal(argumentsFor(args,'temporary'),false));
for(const args of [['--apply'],['--apply','--confirm-db','other'],['--repair'],['--apply','--confirm-db','temporary','extra'],['--confirm-db','temporary']]) test('migration recusa '+JSON.stringify(args),()=>assert.throws(()=>argumentsFor(args,'temporary')));
test('apply exige confirmação literal exata',()=>assert.equal(argumentsFor(['--apply','--confirm-db','temporary'],'temporary'),true));
test('audit recusa qualquer flag de mutation',()=>{assert.equal(argumentsFor([],'temporary',true),false);for(const arg of ['--apply','--repair','--drop']) assert.throws(()=>argumentsFor([arg],'temporary',true));});
test('dry-run não cria índice; apply aditivo e segunda execução no-op',async()=>{
    const db=mongoose.connection.db, products=db.collection('products');
    await products.dropIndex('products_recent');
    assert.ok((await migrate(db)).some(row=>row.name==='products_recent'&&row.status==='MISSING'));
    assert.ok(!(await products.listIndexes().toArray()).some(index=>index.name==='products_recent'));
    await migrate(db,{apply:true});
    const snapshots=async()=>Promise.all([...new Set(manifest.map(index=>index.collection))].map(async name=>({name,indexes:await db.collection(name).listIndexes().toArray()})));
    const first=await snapshots(); await migrate(db,{apply:true}); assert.deepEqual(await snapshots(),first);
});
test('índice divergente impede apply inteiro e não é substituído',async()=>{
    const db=mongoose.connection.db, products=db.collection('products');
    await products.dropIndex('products_recent'); await products.createIndex({name:1},{name:'products_recent'});
    const before=await products.listIndexes().toArray();
    assert.ok((await inventory(db)).some(row=>row.name==='products_recent'&&row.status==='DIVERGENT'));
    await assert.rejects(migrate(db,{apply:true})); assert.deepEqual(await products.listIndexes().toArray(),before);
    await products.dropIndex('products_recent'); await products.createIndex({createdAt:-1,_id:-1},{name:'products_recent'});
});
test('auditoria é somente leitura, não importa models e não expõe dados/URI',async()=>{
    const db=mongoose.connection.db;
    const forbidden=()=>{throw Error('write forbidden');};
    const readonly={collection(name){const collection=db.collection(name);return {listIndexes:()=>collection.listIndexes(),createIndex:forbidden,dropIndex:forbidden,find:forbidden,insertOne:forbidden,updateOne:forbidden};}};
    const before=await inventory(db), result=await inventory(readonly); assert.deepEqual(result,before);
    for(const row of result) assert.deepEqual(Object.keys(row).sort(),['collection','key','name','status']);
    const source=require('node:fs').readFileSync(require.resolve('../backend/scripts/indexes'),'utf8');
    assert.ok(!source.includes("require('../models")); assert.ok(!source.includes('syncIndexes')); assert.ok(!source.includes('dropIndex'));
});
test('F037 índice antigo fica pendente, sem drop automático e reservas continuam únicas',async()=>{
    const db=mongoose.connection.db, collection=db.collection('stockmovements');
    await collection.createIndex({order:1,product:1,type:1},{name:'one_order_product_movement',unique:true});
    await migrate(db,{apply:true});
    assert.ok((await inventory(db)).some(row=>row.status==='PENDING_F037_EXPLICIT_DROP'));
    assert.ok((await collection.listIndexes().toArray()).some(index=>index.name==='one_order_product_movement'));
    const index=(await collection.listIndexes().toArray()).find(index=>index.name==='one_order_product_reserve');
    assert.deepEqual(index.partialFilterExpression,{type:'RESERVE'}); assert.equal(index.unique,true);
});
test('perfil mínimo de audit:indexes aceita apenas DB sem segredos',()=>{
    const config=require('../backend/config/runtimeConfig').loadConfig({NODE_ENV:'production',DB_URI:'mongodb://example.invalid/temporary'},{profile:'indexes-audit'});
    assert.equal(config.jwt,undefined); assert.equal(config.smtp,undefined);
});
test('CLI audit:indexes e migrate:indexes dry-run executam somente no banco temporário',()=>{
    const {spawnSync}=require('node:child_process'), path=require('node:path');
    const cwd=path.resolve(__dirname,'..'), uri=require('./replicaSetHarness').testUri(env.h.database);
    for(const [file,args] of [['auditIndexes.js',[]],['indexes.js',[]],['indexes.js',['--dry-run']]]) {
        const result=spawnSync(process.execPath,['backend/scripts/'+file,...args],{cwd,env:{...process.env,DB_URI:uri},encoding:'utf8',timeout:15000});
        assert.equal(result.status,0); const output=JSON.parse(result.stdout.trim());
        assert.ok(['READ-ONLY','DRY-RUN'].includes(output.mode)); assert.ok(output.indexes.length>10);
        assert.ok(!result.stdout.includes(uri)); assert.ok(!result.stdout.includes(env.admin.email));
    }
});
test('startup readonly recusa unique ausente e aceita ledger legado protegido',async()=>{
    const db=mongoose.connection.db, {assertInvariants}=require('../backend/utils/indexOperations');
    await migrate(db,{apply:true}); await assertInvariants(db);
    const users=db.collection('users'); await users.dropIndex('email_1');
    try { await assert.rejects(assertInvariants(db),/Required invariant indexes/); }
    finally { await users.createIndex({email:1},{name:'email_1',unique:true}); }
    const movement=db.collection('stockmovements'); await movement.dropIndex('one_order_product_reserve');
    try { await assertInvariants(db); }
    finally { await movement.createIndex({order:1,product:1,type:1},{name:'one_order_product_reserve',unique:true,partialFilterExpression:{type:'RESERVE'}}); }
    const net=require('node:net'), reserve=net.createServer();
    await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
    const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
    const server=await require('../backend/server').startServer({...process.env,PORT:String(port),DB_URI:require('./replicaSetHarness').testUri(env.h.database)});
    try { assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/products`)).status,200); }
    finally { await new Promise(resolve=>server.close(resolve)); env.h.configure(); }
});
