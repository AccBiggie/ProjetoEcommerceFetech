const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('ARCH JWT fica no cookie e não entra no JSON público', t => {
    t.mock.method(require('../backend/config/runtimeConfig'), 'getRuntimeConfig', () => ({ environment: 'test', cookie: { expireDays: 7 } }));
    let json, cookie;
    const res = { set: () => res, setHeader: () => res, status: () => res, cookie: (name, value) => { cookie = value; return res; }, json: value => { json = value; return res; } };
    const token = 'fixture-private-jwt';
    require('../backend/utils/jwtToken')({ name: 'Fixture', password: 'private', getJWTToken: () => token }, 200, res);
    assert.equal(cookie, token); assert.doesNotMatch(JSON.stringify(json), /fixture-private-jwt|private/); assert.equal(json.token, undefined);
});
test('ARCH Product domain rejeita mass assignment de campos internos', () => {
    const { input } = require('../backend/utils/productDomain');
    for (const field of ['user', 'reviews', 'ratings', 'numOfReviews', 'priceCents', 'stockLedgerVersion', 'createdAt', '$set']) assert.throws(() => input({ [field]: 'fixture' }), error => error.code === 'PRODUCT_FIELD_NOT_MUTABLE');
});
test('HISTORY arquitetura não permite deletes ou acesso bruto a orders em controllers/services', () => {
    const fs = require('node:fs'), path = require('node:path');
    for (const folder of ['controllers', 'services']) for (const file of fs.readdirSync(path.join(__dirname, '../backend', folder))) {
        if (!file.endsWith('.js')) continue;
        const source = fs.readFileSync(path.join(__dirname, '../backend', folder, file), 'utf8');
        assert.equal(/Order\.(?:deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|findOneAndRemove|collection)\b|collection\(['"]orders['"]\)/.test(source), false, file);
    }
});
test('STATE arquitetura sem confirmação produtiva, helpers ou escrita de estoque na transição', () => {
    const fs = require('node:fs'), path = require('node:path');
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(js|jsx|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
    for (const file of [...walk(path.join(__dirname, '../backend')), ...walk(path.join(__dirname, '../frontend/src'))]) {
        const source = fs.readFileSync(file, 'utf8'); assert.equal(/orderPaymentFixture|markOrderPaidFixture|markE2EOrderPaidFixture|\/test\/mark-paid|confirm-payment|mark-paid/.test(source), false, file);
    }
    const service = fs.readFileSync(path.join(__dirname, '../backend/services/orderStateMachine.js'), 'utf8'); assert.equal(/Product|StockMovement|\.save\(/.test(service), false);
});
test('UL-74/75 controllers/services/seeds não usam User delete/raw users collection', () => {
    for (const directory of ['controllers', 'services', 'scripts']) for (const name of fs.readdirSync(path.join(__dirname, '../backend', directory))) {
        if (!name.endsWith('.js')) continue; const source = fs.readFileSync(path.join(__dirname, '../backend', directory, name), 'utf8');
        assert.doesNotMatch(source, /User\.(?:deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|findOneAndRemove|collection)\b|collection\(['"]users['"]\).*delete/, name);
    }
});
test('MEDIA-AUD runtime never imports test fake and controllers have no Cloudinary calls', () => {
    const fs = require('node:fs'), root = path.join(__dirname, '../backend');
    function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.js')) { const source = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(source, /fakeMediaProvider|tests\/helpers/); if (dir.endsWith('controllers')) assert.doesNotMatch(source, /cloudinary|uploader\./); } } } walk(root);
});
