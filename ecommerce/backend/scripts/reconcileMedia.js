const mongoose = require('mongoose');
const { loadEnvironment, loadConfig, ConfigurationError } = require('../config/runtimeConfig');
function options(args, database) {
    if (!args.length) return { apply: false };
    if (args.length !== 3 || args[0] !== '--apply' || args[1] !== '--confirm-db' || args[2] !== database) throw new Error('Exact database confirmation required');
    return { apply: true };
}
async function main(args = process.argv.slice(2), { provider } = {}) {
    try {
        loadEnvironment(); const config = loadConfig(process.env, { profile: 'media-reconcile' });
        const database = new mongoose.mongo.MongoClient(config.mongo.uri).options.dbName;
        const selected = options(args, database);
        if (selected.apply && !provider && !config.cloudinary.enabled) throw new Error();
        await mongoose.connect(config.mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
        if (selected.apply) {
            await require('../config/mongoTransactions').requireTransactions();
            if (!provider) { require('cloudinary').v2.config(config.cloudinary); provider = require('../services/mediaProvider').createCloudinaryMediaProvider(); }
        }
        const log = require('../observability/logger').createLogger({ level: config.logging.level });
        await require('../services/avatarMediaService').createAvatarMediaService({ provider, log }).reconcile(selected); return 0;
    } catch (err) { console.error(err instanceof ConfigurationError ? err.message : 'Reconciliação indisponível. Apply exige --apply --confirm-db NOME_EXATO e provider configurado.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main, options };
if (require.main === module) main().then(code => { process.exitCode = code; });
