const { isDeepStrictEqual } = require('node:util');
const { manifest } = require('./queryIndexes');
const sameKey = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
const sameOptions = (actual, expected) => Boolean(actual.unique) === Boolean(expected.unique) && isDeepStrictEqual(actual.partialFilterExpression, expected.partialFilterExpression) && !actual.sparse && actual.expireAfterSeconds === expected.expireAfterSeconds && !actual.collation && !actual.hidden;
async function inventory(db) {
    const rows = [];
    for (const collection of new Set(manifest.map(index => index.collection))) {
        let actual;
        try { actual = await db.collection(collection).listIndexes().toArray(); }
        catch (error) { if (error.code !== 26) throw error; actual = []; }
        for (const expected of manifest.filter(index => index.collection === collection)) {
            const found = actual.find(index => index.name === expected.name);
            const equivalent = actual.find(index => sameKey(index.key, expected.key) && sameOptions(index, expected));
            const conflict = actual.find(index => sameKey(index.key, expected.key) && index.name !== 'one_order_product_movement' && !sameOptions(index, expected));
            const valid = found && sameKey(found.key, expected.key) && sameOptions(found, expected);
            rows.push({ collection, name: expected.name, key: expected.key, status: found ? valid ? 'OK' : 'DIVERGENT' : equivalent ? 'EQUIVALENT' : conflict ? 'DIVERGENT' : 'MISSING' });
        }
        if (collection === 'stockmovements' && actual.some(index => index.name === 'one_order_product_movement')) rows.push({ collection, name: 'one_order_product_movement', key: { order: 1, product: 1, type: 1 }, status: 'PENDING_F037_EXPLICIT_DROP' });
        for (const index of actual) if (!manifest.some(item => item.collection === collection && item.name === index.name)) rows.push({ collection, name: index.name, key: index.key, status: 'UNMANAGED_PRESERVED' });
    }
    return rows;
}
function argumentsFor(argv, database, audit = false) {
    if (audit) { if (argv.length) throw new Error('Arguments forbidden'); return false; }
    if (!argv.length || argv.length === 1 && argv[0] === '--dry-run') return false;
    if (argv.length !== 3 || argv[0] !== '--apply' || argv[1] !== '--confirm-db' || argv[2] !== database) throw new Error('Explicit exact database confirmation required');
    return true;
}
async function migrate(db, { apply = false } = {}) {
    const rows = await inventory(db);
    if (apply && rows.some(row => row.status === 'DIVERGENT')) throw new Error('Divergent indexes require explicit manual review');
    for (const row of rows) if (apply && row.status === 'MISSING') {
        const { collection, key, name, ...options } = manifest.find(item => item.collection === row.collection && item.name === row.name);
        await db.collection(collection).createIndex(key, { name, ...options });
    }
    return apply ? inventory(db) : rows;
}
async function assertInvariants(db) {
    const rows = await inventory(db);
    for (const expected of manifest.filter(index => index.unique)) {
        const row = rows.find(item => item.collection === expected.collection && item.name === expected.name);
        if (['OK','EQUIVALENT'].includes(row.status)) continue;
        // F037 deliberately keeps the old constraint until its explicit rollout.
        // It still protects reservations; stock writes retain their F037 gate.
        if (expected.name === 'one_order_product_reserve' && row.status === 'MISSING') {
            let indexes;
            try { indexes = await db.collection('stockmovements').listIndexes().toArray(); }
            catch (error) { if (error.code !== 26) throw error; indexes = []; }
            if (indexes.some(index => index.name === 'one_order_product_movement' && sameKey(index.key, expected.key) && sameOptions(index, { unique: true }))) continue;
        }
        throw new Error('Required invariant indexes must be provisioned before startup');
    }
}
module.exports = { inventory, migrate, argumentsFor, assertInvariants };
