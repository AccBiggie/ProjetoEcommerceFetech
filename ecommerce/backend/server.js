const { initializeConfig, loadEnvironment } = require('./config/runtimeConfig');

async function startServer(env, dependencies = {}) {
    // Validação completa antes de carregar app, configurar providers ou conectar.
    const config = initializeConfig(env);
    const app = dependencies.createApp ? dependencies.createApp(config) : require('./app');
    if (config.cloudinary.enabled) {
        const configureCloudinary = dependencies.configureCloudinary || (settings => require('cloudinary').config(settings));
        configureCloudinary(config.cloudinary);
    }
    await (dependencies.connect || require('./config/database'))(config);
    await (dependencies.requireTransactions || require('./config/mongoTransactions').requireTransactions)();
    await (dependencies.prepare || (async () => {
        await require('./utils/indexOperations').assertInvariants(require('mongoose').connection.db);
        await require('./models/addressModel').init();
        await require('./models/orderModel').init();
        await require('./models/orderIdempotencyModel').init();
        await require('./models/stockMovementModel').init();
        await require('./models/authRateLimitModel').init();
        await require('./models/adminMutationLockModel').init();
        await require('./models/adminAuditEventModel').init();
        await require('./utils/categories').migrateLegacyCategories();
    }))();
    return app.listen(config.port, '127.0.0.1', () => require('./observability/logger').info('app.started', { environment: config.environment, port: config.port, transactionCapable: true }));
}
async function main() {
    loadEnvironment();
    let server;
    const emergency = require('./observability/logger').createLogger({ level: 'error' });
    const shutdown = event => {
        emergency.error(event);
        process.exitCode = 1;
        if (server) server.close(() => process.exit(1));
        else process.exit(1);
    };
    process.on('uncaughtException', () => shutdown('app.uncaught_exception'));
    process.on('unhandledRejection', () => shutdown('app.unhandled_rejection'));
    try { server = await startServer(process.env); }
    catch (error) {
        emergency.error('app.startup.failed', { errorName: error.name, invalidVariables: error.issues?.map(issue => issue.variable) });
        process.exitCode = 1;
        await require('mongoose').disconnect();
    }
}
module.exports = { startServer, main };
if (require.main === module) main();
