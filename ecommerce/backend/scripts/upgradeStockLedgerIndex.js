const mongoose = require('mongoose');
const { loadEnvironment, loadConfig } = require('../config/runtimeConfig');
async function main(argv = process.argv.slice(2)) {
    try {
        loadEnvironment();
        const config = loadConfig(process.env, { profile: 'migration' });
        await mongoose.connect(config.mongo.uri, { autoCreate: false, autoIndex: false });
        if (argv.length !== 2 || argv[0] !== '--confirm-database' || argv[1] !== mongoose.connection.name) throw new Error('Explicit database confirmation required');
        await require('../utils/stockLedgerIndexes').upgradeStockLedgerIndex(mongoose.connection);
        console.log('Índice de reservas preservado; índice de estoque atualizado.');
        return 0;
    } catch { console.error('Atualização de índice indisponível; confirme explicitamente a database.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
