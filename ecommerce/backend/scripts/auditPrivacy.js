const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
async function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length) throw new Error('Arguments forbidden');
        loadEnvironment(); const config = loadConfig(process.env, { profile: 'privacy-audit' });
        await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        await require('../utils/privacyAudit').auditPrivacy(mongoose.connection); return 0;
    } catch (error) { console.error(error instanceof ConfigurationError ? error.message : 'Auditoria de privacidade indisponível ou argumentos inválidos. Somente leitura.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
