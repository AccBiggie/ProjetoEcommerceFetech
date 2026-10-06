const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
module.exports = async () => {
    const state = path.join(__dirname, '../../.test-state.json');
    if (!fs.existsSync(state)) return;
    const { database } = JSON.parse(fs.readFileSync(state, 'utf8'));
    if (!/^fetech_e2e_\d+_\d+$/.test(database)) throw new Error('Nome de banco de teste inválido.');
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`);
    try { await mongoose.connection.dropDatabase(); fs.unlinkSync(state); }
    finally {
        await mongoose.disconnect();
        await fetch('http://127.0.0.1:3300/__test/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
};
