const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
const { auditOrders } = require('../utils/orderHistoryAudit');
async function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length) throw new Error('Argumentos não permitidos.');
        loadEnvironment();
        const config = loadConfig(process.env, { profile: 'orders-audit' });
        await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        const session = await mongoose.connection.startSession({ snapshot: true });
        try { await auditOrders(mongoose.connection, { lifecycle: true, session }); }
        finally { await session.endSession(); }
        return 0;
    } catch (error) {
        console.error(error instanceof ConfigurationError ? error.message : 'Auditoria indisponível ou argumentos inválidos. Operação somente leitura.'); return 1;
    } finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
