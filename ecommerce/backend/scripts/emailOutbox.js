const mongoose = require('mongoose');
const { loadConfig, initializeConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
function argumentsFor(argv, database) {
    if (!argv.length) return false;
    if (argv.length !== 3 || argv[0] !== '--apply' || argv[1] !== '--confirm-db' || argv[2] !== database) throw new Error('Exact database confirmation required');
    return true;
}
async function main(argv = process.argv.slice(2), dependencies = {}) {
    let provider;
    try {
        // Parse destructive intent before any connection or provider creation.
        if (argv.length && (argv.length !== 3 || argv[0] !== '--apply' || argv[1] !== '--confirm-db')) throw new Error('Invalid arguments');
        loadEnvironment(); const base = loadConfig(process.env, { profile: 'email-outbox-audit' });
        const database = new mongoose.mongo.MongoClient(base.mongo.uri).options.dbName;
        const apply = argumentsFor(argv, database), config = apply ? initializeConfig(process.env, { profile: 'email-outbox' }) : base;
        if (apply && !config.smtp?.enabled && !dependencies.provider) throw new Error('Provider not configured');
        await (dependencies.connect || mongoose.connect.bind(mongoose))(config.mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
        const connection = dependencies.connection || mongoose.connection;
        if (!apply) { console.log(JSON.stringify({ mode: 'DRY_RUN', due: await connection.db.collection('emailoutboxes').countDocuments({ status: { $in: ['PENDING', 'RETRY'] }, nextAttemptAt: { $lte: new Date() } }) })); return 0; }
        await require('../config/mongoTransactions').requireTransactions(connection);
        provider = dependencies.provider || require('../services/email/emailProvider').getProvider(config);
        const worker = require('../services/email/worker').createWorker({ Model: require('../services/email/enqueue').modelFor(connection), provider, config });
        try { console.log(JSON.stringify({ mode: 'APPLY', processed: await worker.once() })); } finally { await worker.stop(); }
        return 0;
    } catch (error) { console.error(error instanceof ConfigurationError ? error.message : 'Operação de email indisponível ou confirmação inválida.'); return 1; }
    finally { provider?.close?.(); await (dependencies.disconnect || mongoose.disconnect.bind(mongoose))(); }
}
module.exports = { main, argumentsFor };
if (require.main === module) main().then(code => { process.exitCode = code; });
