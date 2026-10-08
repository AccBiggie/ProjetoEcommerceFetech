// Instância de API separada; usa somente a base temporária fornecida pelo teste.
const mongoose = require('mongoose');
const http = require('node:http');
require('../../backend/config/runtimeConfig').initializeConfig(process.env);
async function main() {
    if (!new mongoose.mongo.MongoClient(process.env.DB_URI).options.dbName.startsWith('fetech_routes_auth_')) throw new Error('Fixture inválida');
    await mongoose.connect(process.env.DB_URI);
    const app = require('../../backend/app');
    await require('../../backend/models/orderModel').init();
    await require('../../backend/models/orderIdempotencyModel').init();
    await require('../../backend/models/stockMovementModel').init();
    await require('../../backend/config/mongoTransactions').requireTransactions();
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    process.send({ port: server.address().port });
    process.on('message', async message => {
        if (message === 'stop') {
            await new Promise(resolve => server.close(resolve));
            await mongoose.disconnect(); process.exit(0);
        }
    });
}
main().catch(() => { process.send({ error: 'Instância de teste indisponível' }); process.exit(1); });
