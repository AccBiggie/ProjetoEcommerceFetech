const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
const { migrateMoney } = require('../utils/moneyMigration');
function parseArguments(argv) {
    let apply = false, confirmDatabase, allowProduction = false;
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === '--apply') apply = true;
        else if (argv[index] === '--confirm-db' && argv[index+1]) confirmDatabase = argv[++index];
        else if (argv[index] === '--allow-production') allowProduction = true;
        else throw new Error('Argumentos inválidos para migração monetária.');
    }
    if (apply && !confirmDatabase) throw new Error('Apply exige --confirm-db com o nome explícito do banco.');
    return { apply, confirmDatabase, allowProduction };
}
async function main(argv = process.argv.slice(2)) {
    try {
        const options = parseArguments(argv);
        loadEnvironment();
        const config = loadConfig(process.env, { profile: 'migration' });
        if (options.apply && config.environment === 'production' && !options.allowProduction) throw new Error('Apply em production exige autorização operacional explícita e backup/restore validado.');
        const database = new mongoose.mongo.MongoClient(config.mongo.uri).options.dbName;
        if (options.apply && options.confirmDatabase !== database) throw new Error('Confirmação do banco incorreta.');
        await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        console.log('Host: ' + mongoose.connection.host);
        await migrateMoney(mongoose.connection, options);
        return 0;
    } catch (error) {
        console.error(error instanceof ConfigurationError ? error.message : 'Migração recusada ou indisponível. Use dry-run; apply exige --confirm-db correto e autorização adicional em production.');
        return 1;
    } finally { await mongoose.disconnect(); }
}
module.exports = { main, parseArguments };
if (require.main === module) main().then(code => { process.exitCode = code; });
