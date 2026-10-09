const mongoose = require('mongoose');
const { loadConfig, loadEnvironment, ConfigurationError } = require('../config/runtimeConfig');
const { auditCategories } = require('../utils/categoryHierarchyAudit');
async function main(argv = process.argv.slice(2)) {
    try {
        if (argv.length) throw new Error('Arguments forbidden');
        loadEnvironment();
        const config = loadConfig(process.env, { profile: 'categories-audit' });
        await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
        await auditCategories(mongoose.connection);
        return 0;
    } catch (error) {
        console.error(error instanceof ConfigurationError ? error.message : 'Auditoria de categorias indisponível ou argumentos inválidos. Operação somente leitura.');
        return 1;
    } finally { await mongoose.disconnect(); }
}
module.exports = { main };
if (require.main === module) main().then(code => { process.exitCode = code; });
