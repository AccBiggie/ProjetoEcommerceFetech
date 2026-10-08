const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
const { auditShippingSnapshots } = require('../utils/shippingSnapshotAudit');

async function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length) throw new Error('Esta auditoria não aceita argumentos de escrita.');
        loadEnvironment();
        const config = loadConfig(process.env, { profile: 'shipping-audit' });
        await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        await auditShippingSnapshots(mongoose.connection);
        return 0;
    } catch (error) {
        console.error(error instanceof ConfigurationError ? error.message : 'Auditoria indisponível ou argumentos inválidos. Operação somente leitura.');
        return 1;
    } finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
