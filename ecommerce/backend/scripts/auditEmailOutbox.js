const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
async function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length) throw new Error('Arguments forbidden');
        loadEnvironment(); const config = loadConfig(process.env, { profile: 'email-outbox-audit' });
        await mongoose.connect(config.mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
        await require('../utils/emailOutboxAudit').audit(mongoose.connection); return 0;
    } catch (error) { console.error(error instanceof ConfigurationError ? error.message : 'Auditoria de email indisponível. Somente leitura, sem argumentos.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
