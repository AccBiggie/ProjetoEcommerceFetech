const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { startReplicaSet, testUri } = require('./replicaSetHarness');
const { parseArgs, targetName } = require('../backend/utils/backupContract');
const { discoverTools, runTool, toolConnection } = require('../backend/utils/backupTools');
const { canonical, snapshotDatabase, verifyDatabase } = require('../backend/utils/backupVerification');
const ops = require('../backend/services/databaseBackupService');
const { loadConfig } = require('../backend/config/runtimeConfig');
const root = path.resolve(__dirname, '../..'), suffix = `${process.pid}_${Date.now()}`;
const source = 'fetech_backup_source_' + suffix, target = 'fetech_restore_' + suffix;
let mongo, ownsMongo = false, tools, connection, db, output, backup, report, sourceSnapshot, objects, toolsUnavailable;
const uri = name => { const url = new URL(mongo.base); url.pathname = '/' + name; return url.toString(); };
const options = extra => ({ uri: uri(source), backup: backup.directory, target, confirmation: target, tools, write: () => {}, ...extra });
async function seed() {
    const models = {};
    for (const [name, file] of [['User','userModel'],['Product','productModel'],['Category','categoryModel'],['Address','addressModel'],['Order','orderModel'],['OrderIdempotency','orderIdempotencyModel'],['StockMovement','stockMovementModel'],['AuthRateLimit','authRateLimitModel'],['AdminMutationLock','adminMutationLockModel']]) {
        models[name] = connection.model(name, require('../backend/models/' + file).schema); await models[name].init();
    }
    const user = await models.User.create({ name: 'Synthetic Fixture', email: 'backup-fixture@example.test', password: 'SyntheticBackup123!', role: 'admin', tokenVersion: 7, avatar: { public_id: 'fixture', url: '/Profile.png' } });
    const category = await models.Category.create({ name: 'Synthetic', name_key: 'synthetic' });
    const product = await models.Product.create(require('./fixtures').productData({ name: 'Synthetic Product', category: category.name, category_id: category._id, user: user._id, Stock: 11, price: '129.99', oldPrice: '149.99', installmmentPrice: '10.84' }));
    const shipping = { recipientName: 'Synthetic Recipient', address: 'Synthetic Street', number: '001A', complement: '', neighborhood: 'Synthetic Area', city: 'Synthetic City', state: 'PR', country: 'Brasil', pinCode: '01234567', phoneNo: '04123456789' };
    await models.Address.create({ ...shipping, label: 'Synthetic Address', user: user._id, favorite: true });
    const inventory = require('../backend/services/orderInventoryService').createOrderInventoryService({ Product: models.Product, Order: models.Order, Movement: models.StockMovement, connection });
    const idempotency = require('../backend/services/orderIdempotencyService').createOrderIdempotencyService({ Claim: models.OrderIdempotency, Order: models.Order });
    const order = async quantity => {
        const intent = { shippingInfo: shipping, orderItems: [{ product: product.id, quantity }] }, key = crypto.randomUUID();
        return (await idempotency.execute({ user: user._id, key, canonical: require('../shared/orderIntent.mjs').serializeOrderIntent(intent), prepare: () => inventory.prepare(intent), create: (_prepared, hashes, complete) => inventory.create({ intent, user: user._id, hashes, complete }) })).order;
    };
    const pending = await order(2), paid = await order(1);
    await db.collection('orders').updateOne({ _id: paid._id }, { $set: { paymentStatus: 'PAID', paidAt: new Date('2026-10-08T00:00:00Z'), orderStatus: 'Shipped', administrativeArchivedAt: new Date('2026-10-08T01:00:00Z'), administrativeArchivedBy: user._id } });
    await models.AuthRateLimit.create({ _id: crypto.randomBytes(32).toString('hex'), scope: 'fixture', count: 2, pending: 0, windowStartedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) });
    await models.AdminMutationLock.create({ _id: 'fixture', fence: 3, lockedUntil: new Date(0) });
    return { user, product, pending, paid };
}
before(async () => {
    const localTools = path.join(root, '.local/mongodb-tools/bin');
    try { tools = await discoverTools(process.env.FETECH_TEST_MONGO_TOOLS || (await fs.stat(localTools).catch(() => null) ? localTools : undefined)); }
    catch { toolsUnavailable = true; return; }
    mongo = process.env.FETECH_TEST_MONGO_BASE ? { base: process.env.FETECH_TEST_MONGO_BASE } : await startReplicaSet(); ownsMongo = !process.env.FETECH_TEST_MONGO_BASE;
    output = await fs.mkdtemp(path.join(root, '.local/backups-test-'));
    connection = await mongoose.createConnection(uri(source)).asPromise(); db = connection.db; objects = await seed();
    sourceSnapshot = await snapshotDatabase(db);
    backup = await ops.backupDatabase({ uri: uri(source), output, tools, write: () => {} });
    report = await ops.restoreDatabase(options());
    console.log(JSON.stringify({ probe: 'backup-restore-drill', source, target, tools: backup.manifest.mongoToolsVersion, collections: Object.keys(backup.manifest.collections).length,
        backupBytes: backup.manifest.archiveBytes, backupDurationMs: backup.manifest.backupDurationMs, restoreDurationMs: report.durationMs, verified: report.verified }));
});
after(async () => {
    try {
        if (connection) {
            const names = (await connection.getClient().db('admin').admin().listDatabases()).databases.map(row => row.name);
            for (const name of names) if (name === source || name.startsWith('fetech_restore_') && name.endsWith(suffix)) await connection.getClient().db(name).dropDatabase();
            await connection.close();
        }
    } finally {
        if (ownsMongo) await mongo.stop();
        if (output) { const resolved = path.resolve(output); assert.equal(path.dirname(resolved), path.join(root, '.local')); assert.ok(path.basename(resolved).startsWith('backups-test-')); await fs.rm(resolved, { recursive: true, force: true }); }
    }
});
const real = (name, fn) => test(name, async t => { if (toolsUnavailable) { t.skip('MongoDB Database Tools ausentes: restore real bloqueado.'); return; } await fn(t); });
test('BACKUP argumentos obrigatórios e sem flags destrutivas/shell', () => {
    assert.deepEqual(parseArgs(['--output','folder with spaces'], 'backup'), { output: 'folder with spaces' });
    for (const args of [[], ['--drop'], ['--replace','yes'], ['--output','x','--output','y'], ['--output','--db']]) assert.throws(() => parseArgs(args,'backup'));
    assert.throws(() => parseArgs(['--backup','x'],'restore'));
});
for (const name of ['admin','local','config','test','fetech','fetech_restore_prod','fetech_restore_live','fetech_restore_x;bad','../fetech_restore_x','fetech_restore_*']) test(`BACKUP target inseguro ${name}`, () => assert.throws(() => targetName(name, 'fetech', 'fetech', name)));
test('BACKUP target igual origem/configuração e confirmação errada bloqueados', () => {
    assert.throws(() => targetName('fetech_restore_x','fetech_restore_x','fetech','fetech_restore_x'));
    assert.throws(() => targetName('fetech_restore_x','source','fetech_restore_x','fetech_restore_x'));
    assert.throws(() => targetName('fetech_restore_x','source','configured','wrong'));
});
test('BACKUP prerequisite ausente retorna erro seguro', async () => { await assert.rejects(discoverTools(path.join(root,'.local/no-such-tools')), { code: 'BACKUP_TOOL_UNAVAILABLE' }); });
test('BACKUP perfil mínimo dispensa SMTP/JWT e valida DB_URI', () => {
    assert.equal(loadConfig({ DB_URI: 'mongodb://127.0.0.1:27017/fetech', NODE_ENV: 'production' }, { profile: 'database-operations' }).profile, 'database-operations');
    assert.throws(() => loadConfig({}, { profile: 'database-operations' }));
});
test('BACKUP child nonzero não ecoa secrets nem executa shell', async () => {
    await assert.rejects(runTool(process.execPath, ['-e', "process.stderr.write('PRIVATE_PASSWORD'); process.exit(7)"]), error => error.exitCode === 7 && !error.message.includes('PRIVATE_PASSWORD'));
});
test('BACKUP cancelamento encerra child e não declara sucesso', async () => {
    const controller = new AbortController();
    const pending = runTool(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
    setTimeout(() => controller.abort(), 50); await assert.rejects(pending);
});
test('BACKUP conexão temporária fica fora dos artefatos e é removida', async () => {
    let file;
    await toolConnection('mongodb://synthetic:PRIVATE_PASSWORD@localhost/fetech', async config => { file = config; assert.ok((await fs.readFile(config,'utf8')).includes('PRIVATE_PASSWORD')); });
    assert.equal(await fs.stat(file).catch(() => null), null);
});
real('BACKUP mongodump/mongorestore reais, archive completo, manifesto e source intacta', async () => {
    assert.ok(backup.manifest.archiveBytes > 0); assert.equal(backup.manifest.complete, true); assert.equal(report.verified, true);
    assert.deepEqual(await snapshotDatabase(db), sourceSnapshot); await ops.loadBackup(backup.directory);
    const content = await fs.readFile(path.join(backup.directory, 'backup-manifest.json'),'utf8');
    for (const sentinel of ['mongodb://','PRIVATE_','Synthetic Street','Synthetic Recipient','backup-fixture@example.test','01234567','04123456789','DB_URI','password']) assert.ok(!content.includes(sentinel));
});
real('BACKUP collections, contagens, índices e dados BSON restaurados iguais', async () => {
    assert.equal(canonical(await snapshotDatabase(connection.getClient().db(target))), canonical(sourceSnapshot));
    for (const [collection, index] of [['orders','one_order_per_key'],['orderidempotencies','one_order_intent'],['stockmovements','one_order_product_movement'],['addresses','one_favorite_per_user'],['users','email_1'],['categories','name_key_1']]) {
        const row = (await connection.getClient().db(target).collection(collection).listIndexes().toArray()).find(row => row.name === index); assert.equal(row.unique,true);
        if (['orders','addresses'].includes(collection)) assert.ok(row.partialFilterExpression);
    }
});
real('BACKUP cents, shipping strings, payment, archive, tokenVersion e hashes preservados', async () => {
    const restored = connection.getClient().db(target), order = await restored.collection('orders').findOne({ _id: objects.paid._id });
    assert.equal(order.totalPriceCents,12999); assert.equal(order.shippingInfo.pinCode,'01234567'); assert.equal(order.shippingInfo.phoneNo,'04123456789');
    assert.equal(order.paymentStatus,'PAID'); assert.ok(order.paidAt instanceof Date); assert.ok(order.administrativeArchivedAt instanceof Date); assert.equal(String(order.administrativeArchivedBy),objects.user.id);
    assert.equal((await restored.collection('users').findOne({ _id:objects.user._id })).tokenVersion,7);
    const old = await db.collection('users').findOne({ _id:objects.user._id }), current = await restored.collection('users').findOne({ _id:objects.user._id }); assert.equal(Boolean(old.password===current.password),true);
    assert.equal((await restored.collection('products').findOne({ _id:objects.product._id })).Stock,8);
    assert.equal((await restored.collection('orders').findOne({ _id:objects.pending._id })).paymentStatus,'PENDING');
});
real('BACKUP claims e movements mantêm relações e reserva transacional', async () => {
    const restored = connection.getClient().db(target);
    for (const claim of await restored.collection('orderidempotencies').find({status:'COMPLETED'}).toArray()) assert.ok(await restored.collection('orders').findOne({_id:claim.order}));
    for (const movement of await restored.collection('stockmovements').find({}).toArray()) { assert.ok(await restored.collection('orders').findOne({_id:movement.order})); assert.ok(await restored.collection('products').findOne({_id:movement.product})); }
    assert.equal(Object.keys(backup.manifest.invariants).length,0);
});
real('BACKUP leitura funcional de Order/Product/User no alvo sem criar índices', async () => {
    const restored = await mongoose.createConnection(uri(target),{autoIndex:false,autoCreate:false}).asPromise();
    try {
        for (const [name,file,id] of [['Order','orderModel',objects.paid._id],['Product','productModel',objects.product._id],['User','userModel',objects.user._id]]) assert.ok(await restored.model(name,require('../backend/models/'+file).schema).findById(id));
    } finally { await restored.close(); }
});
real('BACKUP restore repetido/destino não vazio aborta sem alteração', async () => {
    const before=await snapshotDatabase(connection.getClient().db(target)); await assert.rejects(ops.restoreDatabase(options()),{code:'RESTORE_TARGET_NOT_EMPTY'}); assert.deepEqual(await snapshotDatabase(connection.getClient().db(target)),before);
});
real('BACKUP segunda captura usa diretório diferente sem overwrite', async () => {
    const second=await ops.backupDatabase({uri:uri(source),output,tools,write:()=>{}}); assert.notEqual(second.directory,backup.directory); await ops.loadBackup(backup.directory); await ops.loadBackup(second.directory);
});
async function damaged(name, mutate, code) {
    const directory=path.join(output,name); await fs.cp(backup.directory,directory,{recursive:true}); await mutate(directory);
    const badTarget='fetech_restore_bad_'+suffix;
    await assert.rejects(ops.restoreDatabase(options({backup:directory,target:badTarget,confirmation:badTarget})),{code});
    assert.equal((await connection.getClient().db(badTarget).listCollections().toArray()).length,0);
}
real('BACKUP archive adulterado rejeitado antes de qualquer write', () => damaged('corrupt', async dir => {const file=path.join(dir,'database.archive.gz'), bytes=await fs.readFile(file);bytes[10]^=1;await fs.writeFile(file,bytes);},'BACKUP_CHECKSUM_INVALID'));
real('BACKUP manifesto adulterado rejeitado antes de qualquer write', () => damaged('manifest', dir=>fs.appendFile(path.join(dir,'backup-manifest.json'),' '),'BACKUP_CHECKSUM_INVALID'));
real('BACKUP versão de manifesto desconhecida rejeitada', () => damaged('version', async dir => {const file=path.join(dir,'backup-manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));m.formatVersion=2;await fs.writeFile(file,JSON.stringify(m));await fs.writeFile(path.join(dir,'backup-manifest.sha256'),await ops.sha256(file));},'BACKUP_MANIFEST_INVALID'));
real('BACKUP path traversal em metadata não constrói comandos/arquivos', () => damaged('traversal', async dir => {const file=path.join(dir,'backup-manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));m.database='../outside';await fs.writeFile(file,JSON.stringify(m));await fs.writeFile(path.join(dir,'backup-manifest.sha256'),await ops.sha256(file));},'BACKUP_DATABASE_INVALID'));
real('BACKUP partial e manifesto ausente são rejeitados', async () => {
    await assert.rejects(ops.loadBackup(path.join(output,'incomplete.partial')),{code:'BACKUP_INCOMPLETE'});
    const missing=path.join(output,'missing');await fs.mkdir(missing);await assert.rejects(ops.loadBackup(missing));
});
real('BACKUP verifier detecta alteração de conteúdo mesmo mantendo count', async () => {
    const restored=connection.getClient().db(target);await restored.collection('products').updateOne({_id:objects.product._id},{$inc:{Stock:1}});
    await assert.rejects(ops.verifyBackup(options()),{code:'RESTORE_VERIFICATION_FAILED'});
    await restored.collection('products').updateOne({_id:objects.product._id},{$inc:{Stock:-1}});await ops.verifyBackup(options());
});
real('BACKUP falha real de tool não publica backup final ou restore validado', async () => {
    const invalid={mongodump:{executable:process.execPath,version:'100.0.0'},mongorestore:tools.mongorestore};
    await assert.rejects(ops.backupDatabase({uri:uri(source),output,tools:invalid,write:()=>{}}));
    const badTarget='fetech_restore_failed_'+suffix;
    await assert.rejects(ops.restoreDatabase(options({target:badTarget,confirmation:badTarget,tools:{...tools,mongorestore:{executable:process.execPath}}})));
    assert.ok((await connection.getClient().db(badTarget).listCollections().toArray()).some(row=>row.name==='fetech_restore_guard'));
});
real('BACKUP fluxo completo preserva origem e verificação separada READ_ONLY', async () => { await ops.verifyBackup(options());assert.deepEqual(await snapshotDatabase(db),sourceSnapshot); });
