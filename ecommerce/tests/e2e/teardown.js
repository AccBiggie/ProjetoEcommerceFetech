const { testUri } = require('../replicaSetHarness');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
module.exports = async () => {
    const { state, origin } = require('../helpers/e2eContext').context();
    if (!fs.existsSync(state)) return;
    const { database, uri } = JSON.parse(fs.readFileSync(state, 'utf8'));
    if (!/^fetech_e2e_\d+_\d+$/.test(database)) throw new Error('Nome de banco de teste inválido.');
    if (uri !== testUri(database)) throw new Error("URI fora do replica set de teste.");
    await mongoose.connect(uri);
    try { await mongoose.connection.dropDatabase(); fs.unlinkSync(state); }
    finally {
        await mongoose.disconnect();
        await fetch(origin + '/__test/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
};
