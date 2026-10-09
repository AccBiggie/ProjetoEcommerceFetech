const mongoose = require('mongoose');
const http = require('node:http');
async function main() {
    const uri = process.env.CATEGORY_TEST_URI;
    if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/fetech_routes_auth_\d+_\d+\?/.test(uri)) throw new Error('Isolated database required');
    require('../../backend/config/runtimeConfig').initializeConfig(process.env);
    await mongoose.connect(uri);
    const server = http.createServer(require('../../backend/app'));
    server.listen(0, '127.0.0.1', () => process.send({ ready: true, base: 'http://127.0.0.1:' + server.address().port }));
}
main().catch(() => process.exit(1));
