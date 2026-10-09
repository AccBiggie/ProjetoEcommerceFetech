const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { auditCategories } = require('../backend/utils/categoryHierarchyAudit');
const { loadConfig } = require('../backend/config/runtimeConfig');
let env, db;
before(async () => { env = await require('./helpers/observabilityHarness').start(); db = mongoose.connection.db; });
after(async () => { if (env) await env.stop(); });
beforeEach(async () => { await db.collection('categories').deleteMany({}); await db.collection('products').deleteMany({}); });
const id = () => new mongoose.Types.ObjectId();
const insertCategories = rows => db.collection('categories').insertMany(rows.map(row => ({ name_key: String(row._id), ...row })));
const audit = () => auditCategories(mongoose.connection, { write() {} });
const snapshot = async () => {
    const result = {};
    for (const { name } of await db.listCollections().toArray()) result[name] = await db.collection(name).find().sort({ _id: 1 }).toArray();
    return result;
};
test('HIER-AUD roots null/ausente e árvore válida não geram falsos positivos', async () => {
    const a = id(), b = id(); await insertCategories([{ _id: a, parent_id: null }, { _id: b, parent_id: a }, { _id: id() }]);
    await db.collection('products').insertOne({ _id: id(), category_id: b, category: 'PRIVATE_NAME' });
    assert.deepEqual((await audit()).issues, []);
});
test('HIER-AUD missing parent e parent malformado são detectados sem texto arbitrário', async () => {
    await insertCategories([{ _id: id(), parent_id: id() }, { _id: id(), parent_id: 'PRIVATE_SENTINEL' }]);
    const result = await audit(); assert.equal(result.issues.length, 2); assert.ok(result.issues.every(r => r.code === 'CATEGORY_MISSING_PARENT')); assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('HIER-AUD self-parent reporta self e componente cíclico uma vez', async () => {
    const a = id(); await db.collection('categories').insertOne({ _id: a, parent_id: a });
    assert.deepEqual((await audit()).issues.map(r => r.code).sort(), ['CATEGORY_CYCLE', 'CATEGORY_SELF_PARENT']);
});
test('HIER-AUD múltiplos ciclos e nodes que entram no ciclo são canonicalizados', async () => {
    const a = id(), b = id(), c = id(), d = id();
    await insertCategories([{ _id: a, parent_id: b }, { _id: b, parent_id: a }, { _id: c, parent_id: d }, { _id: d, parent_id: c }, { _id: id(), parent_id: a }]);
    const issues = (await audit()).issues; assert.equal(issues.length, 2); assert.ok(issues.every(r => r.code === 'CATEGORY_CYCLE' && r.categoryIds.length === 2));
});
test('HIER-AUD Product ref órfã/obrigatória ausente, ID malformado e legado opcional', async () => {
    await db.collection('products').insertMany([{ _id: id(), category_id: id(), category: 'PRIVATE_DESCRIPTION' }, { _id: id() }, { _id: id(), category_id: 'PRIVATE_USERNAME' }, { _id: id(), category: 'Legacy', category_id: null }]);
    const report = await audit(); assert.equal(report.issues.length, 3); assert.ok(report.issues.every(r => r.code === 'PRODUCT_MISSING_CATEGORY')); assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
});
test('HIER-AUD read-only: snapshot completo permanece idêntico e output só IDs/códigos', async () => {
    await db.collection('categories').insertOne({ _id: id(), parent_id: id(), name: 'PRIVATE_CATEGORY_DESCRIPTION' });
    await db.collection('products').insertOne({ _id: id(), category_id: id(), description: 'PRIVATE_DESCRIPTION', price: 99 });
    const before = await snapshot(), output = [];
    await auditCategories(mongoose.connection, { write: line => output.push(line) }); assert.deepEqual(await snapshot(), before); assert.ok(!output.join('').includes('PRIVATE_')); assert.ok(!output.join('').includes('price'));
});
test('HIER-AUD User desativado não interfere', async () => {
    await env.h.createUser(); assert.deepEqual((await audit()).issues, []);
});
test('HIER-AUD cadeia longa e ciclos não entram em loop', { timeout: 5000 }, async () => {
    const ids = Array.from({ length: 2000 }, id);
    await insertCategories(ids.map((_id, i) => ({ _id, parent_id: ids[(i + 1) % ids.length] })));
    const report = await audit(); assert.equal(report.issues.length, 1); assert.equal(report.issues[0].categoryIds.length, 2000);
});
test('HIER-AUD config mínima não exige SMTP, Cloudinary ou servidor', () => {
    assert.equal(loadConfig({ DB_URI: process.env.DB_URI, NODE_ENV: 'test' }, { profile: 'categories-audit' }).profile, 'categories-audit');
});
test('HIER-AUD CLI em DB temporária é read-only e rejeita --apply', async () => {
    await db.collection('categories').insertOne({ _id: id(), parent_id: id() });
    const before = await snapshot();
    const run = args => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, '../backend/scripts/auditCategories.js'), ...args], { windowsHide: true, env: { ...process.env, DB_URI: process.env.DB_URI }, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; }); child.once('error', reject); child.once('exit', code => resolve({ code, output }));
    });
    const report = await run([]); assert.equal(report.code, 0); assert.match(report.output, /CATEGORY_MISSING_PARENT/); assert.match(report.output, /READ_ONLY/);
    assert.deepEqual(await snapshot(), before); assert.equal((await run(['--apply'])).code, 1); assert.deepEqual(await snapshot(), before);
});
