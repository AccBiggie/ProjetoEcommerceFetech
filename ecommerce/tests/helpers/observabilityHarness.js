const { startReplicaSet } = require('../replicaSetHarness');
async function start() {
    const owns = !process.env.FETECH_TEST_MONGO_BASE;
    const mongo = owns ? await startReplicaSet() : undefined;
    if (mongo) process.env.FETECH_TEST_MONGO_BASE = mongo.base;
    const h = require('../authHarness');
    try {
        await h.start();
        await require('../../backend/models/adminAuditEventModel').init();
        return { h, stop: async () => { try { await h.stop(); } finally { if (owns) await mongo.stop(); } } };
    } catch (error) { try { await h.stop(); } finally { if (owns) await mongo.stop(); } throw error; }
}
async function capture(action) {
    const streams = [process.stdout, process.stderr], original = streams.map(stream => stream.write), lines = [];
    try {
        streams.forEach(stream => { stream.write = function (chunk, encoding, callback) { lines.push(String(chunk)); if (typeof encoding === 'function') encoding(); else if (typeof callback === 'function') callback(); return true; }; });
        const result = await action();
        return { result, output: lines.join(''), logs: lines.join('').split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)) };
    } finally { streams.forEach((stream, index) => { stream.write = original[index]; }); }
}
module.exports = { start, capture };
