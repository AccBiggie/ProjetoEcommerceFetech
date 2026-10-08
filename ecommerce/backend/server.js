const { initializeConfig, loadEnvironment, ConfigurationError } = require('./config/runtimeConfig');

async function startServer(env, dependencies = {}) {
    // Validação completa antes de carregar app, configurar providers ou conectar.
    const config = initializeConfig(env);
    const app = dependencies.createApp ? dependencies.createApp(config) : require('./app');
    if (config.cloudinary.enabled) {
        const configureCloudinary = dependencies.configureCloudinary || (settings => require('cloudinary').config(settings));
        configureCloudinary(config.cloudinary);
    }
    await (dependencies.connect || require('./config/database'))(config);
    await (dependencies.prepare || (async () => {
        await require('./models/addressModel').init();
        await require('./models/orderModel').init();
        await require('./models/orderIdempotencyModel').init();
        await require('./models/authRateLimitModel').init();
        await require('./models/adminMutationLockModel').init();
        await require('./utils/categories').migrateLegacyCategories();
    }))();
    return app.listen(config.port, '127.0.0.1', () => console.log(`Server is Working on http://localhost:${config.port}`));
}
async function main() {
    loadEnvironment();
    let server;
    const shutdown = () => {
        console.error('Falha operacional do servidor. Nenhuma configuração sensível será exibida.');
        process.exitCode = 1;
        if (server) server.close(() => process.exit(1));
        else process.exit(1);
    };
    process.on('uncaughtException', shutdown);
    process.on('unhandledRejection', shutdown);
    try { server = await startServer(process.env); }
    catch (error) {
        console.error(error instanceof ConfigurationError ? error.message : 'Falha ao iniciar o servidor. Verifique configuração e conectividade do MongoDB.');
        process.exitCode = 1;
        await require('mongoose').disconnect();
    }
}
module.exports = { startServer, main };
if (require.main === module) main();
