const mongoose = require('mongoose');
const { loadEnvironment, loadConfig } = require('../config/runtimeConfig');
const operations = require('../utils/indexOperations');
async function main(argv = process.argv.slice(2), audit = false) {
    try {
        loadEnvironment();
        const config = loadConfig(process.env, { profile: audit ? 'indexes-audit' : 'migration' });
        // Parse database confirmation before connecting; never import models here.
        const database = new mongoose.mongo.MongoClient(config.mongo.uri).options.dbName;
        const apply = operations.argumentsFor(argv, database, audit);
        await mongoose.connect(config.mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 });
        if (mongoose.connection.name !== database) throw new Error('Database mismatch');
        const rows = audit ? await operations.inventory(mongoose.connection.db) : await operations.migrate(mongoose.connection.db, { apply });
        console.log(JSON.stringify({ mode: audit ? 'READ-ONLY' : apply ? 'APPLY' : 'DRY-RUN', indexes: rows }));
        return 0;
    } catch { console.error('Operação de índices indisponível ou argumentos inválidos. Nenhum índice divergente é substituído automaticamente.'); return 1; }
    finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
