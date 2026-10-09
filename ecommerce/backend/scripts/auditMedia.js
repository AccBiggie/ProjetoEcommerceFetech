const mongoose = require('mongoose');
const { loadEnvironment, loadConfig, ConfigurationError } = require('../config/runtimeConfig');
async function main(args = process.argv.slice(2)) {
    try {
        if (args.length) throw new Error();
        loadEnvironment(); const config = loadConfig(process.env, { profile: 'media-audit' });
        await mongoose.connect(config.mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
        await require('../utils/mediaAudit').auditMedia(mongoose.connection); return 0;
    } catch (err) { console.error(err instanceof ConfigurationError ? err.message : 'Auditoria de mídia indisponível; operação somente leitura.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
