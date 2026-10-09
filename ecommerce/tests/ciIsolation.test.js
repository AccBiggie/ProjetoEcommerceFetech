const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { MongoClient } = require('mongoose').mongo;
const { startReplicaSet } = require('./replicaSetHarness');
test('CI dois replica sets próprios suportam transações e cleanup independente', async () => {
    const owned = [];
    try {
        const results = await Promise.allSettled([startReplicaSet(), startReplicaSet()]);
        for (const result of results) if (result.status === 'fulfilled') owned.push(result.value);
        const failure = results.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
        assert.equal(owned.length, 2); assert.notEqual(owned[0].port, owned[1].port); assert.notEqual(owned[0].directory, owned[1].directory);
        const timestamp = Date.now(), names = owned.map((_, index) => `fetech_ci_isolation_${process.pid}_${timestamp + index}`); assert.notEqual(...names);
        for (let index = 0; index < owned.length; index++) {
            const client = new MongoClient(owned[index].base), database = names[index];
            try {
                await client.connect(); const db = client.db(database); await db.createCollection('transactionProof');
                const session = client.startSession();
                try { await session.withTransaction(() => db.collection('transactionProof').insertOne({ proof: index }, { session })); }
                finally { await session.endSession(); }
                assert.equal(await db.collection('transactionProof').countDocuments(), 1);
                assert.equal(db.databaseName, names[index]); assert.match(database, /^fetech_ci_isolation_\d+_\d+$/); await db.dropDatabase();
            } finally { await client.close(); }
        }
    } finally { await Promise.all(owned.map(mongo => mongo.stop())); for (const mongo of owned) assert.equal(fs.existsSync(mongo.directory), false); }
});
