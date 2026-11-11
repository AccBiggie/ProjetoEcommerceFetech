const { origin, port, state } = require('../helpers/e2eContext').context();
const { testUri } = require('../replicaSetHarness');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const { fixtures, productData, password } = require('../fixtures');
const Product = require('../../backend/models/productModel');
const nodemailer = require('nodemailer');
const database = `fetech_e2e_${process.pid}_${Date.now()}`;
Object.assign(process.env, { NODE_ENV: 'test', PORT: '4000', TRUST_PROXY_HOPS: '0' });
Object.assign(process.env, { AUTH_FORGOT_MIN_RESPONSE_MS: '20', JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRE: '7d', COOKIE_EXPIRE: '7', FRONTEND_URL: origin, PORTEMAIL: '587', EMAIL_SECURE: 'false', HOST: 'smtp.test', USER: 'test', PASSWORD: 'test', CLOUDINARY_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
// O envio externo é substituído somente neste servidor isolado de testes.
const resetLinks = {};
nodemailer.createTransport = () => ({ sendMail: async mail => { resetLinks[mail.to] = mail.text.match(/http[^\s]+\/password\/reset\/[a-f0-9]+/)[0]; } });
process.env.DB_URI = testUri(database);
require('../../backend/config/runtimeConfig').initializeConfig(process.env);
const app = require('../../backend/app');
require('../../backend/services/mediaProvider').getProvider = () => mediaFake;
const mediaFake = require('../helpers/fakeMediaProvider').createFakeMediaProvider();
(async () => {
    await mongoose.connect(testUri(database));
    await fixtures();
    await require('../../backend/config/mongoTransactions').requireTransactions();
    for (const email of ['cancellation@routes.example.com', 'privacy@routes.example.com', 'privacy-cancel@routes.example.com', 'media@routes.example.com', 'idempotency-loss@routes.example.com', 'idempotency-errors@routes.example.com', 'inventory@routes.example.com', 'state-machine@routes.example.com', 'lifecycle@routes.example.com', 'reviews-a@routes.example.com', 'reviews-b@routes.example.com']) {
        await require('../../backend/models/userModel').create({ name: 'Cliente Idempotência', email, password, role: 'user',
            avatar: { public_id: 'fixture-avatar', url: '/Profile.png' } });
    }
    await Product.create(productData({ name: 'Teste & / Pesquisa' }));
    await Product.create(productData({ name: 'Produto extra para paginação' }));
    await require('../../backend/utils/categories').migrateLegacyCategories();
    fs.writeFileSync(state, JSON.stringify({ database, uri: process.env.DB_URI }));
    const server = express();
    let listener;
    server.post('/__test/shutdown', (req, res) => {
        res.on('finish', () => {
            listener.close(); listener.closeAllConnections();
            mongoose.disconnect().finally(() => process.exit(0));
        });
        res.json({ success: true });
    });
    server.get('/__test/reset-link', (req, res) => res.json({ url: resetLinks[req.query.email] }));
    server.use((req, res, next) => req.path.startsWith('/api/') ? app(req, res, next) : next());
    // Somente host estático de teste: não representa deployment produtivo.
    server.use(require('../../backend/config/securityHeaders').frontendSecurityHeaders());
    // Harness exists only on this isolated test host, never in production routes/build.
    const boundaryHarness = await import('../helpers/buildStorageHarness.mjs');
    await boundaryHarness.buildStorageHarness();
    server.use('/__test/boundary', express.static(boundaryHarness.output));
    server.use(express.static(path.join(__dirname, '../../frontend/build')));
    server.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, '../../frontend/build/index.html')));
    listener = server.listen(port, '127.0.0.1', () => console.log('Servidor E2E pronto; banco temporario isolado.'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { listener.close(); listener.closeAllConnections(); mongoose.disconnect().finally(() => process.exit(1)); });
})().catch(error => { console.error('Servidor E2E isolado falhou.'); process.exit(1); });
