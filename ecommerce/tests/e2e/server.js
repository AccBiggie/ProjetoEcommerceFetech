const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const { fixtures, productData } = require('../fixtures');
const Product = require('../../backend/models/productModel');
const nodemailer = require('nodemailer');
const database = `fetech_e2e_${process.pid}_${Date.now()}`;
Object.assign(process.env, { JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRE: '7d', COOKIE_EXPIRE: '7', FRONTEND_URL: 'http://127.0.0.1:3300', HOST: 'smtp.test', USER: 'test', PASSWORD: 'test', CLOUDINARY_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
// O envio externo é substituído somente neste servidor isolado de testes.
const resetLinks = {};
nodemailer.createTransport = () => ({ sendMail: async mail => { resetLinks[mail.to] = mail.text.match(/http[^\s]+\/password\/reset\/[a-f0-9]+/)[0]; } });
const app = require('../../backend/app');
(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`);
    await fixtures();
    await Product.create(productData({ name: 'Teste & / Pesquisa' }));
    await Product.create(productData({ name: 'Produto extra para paginação' }));
    fs.writeFileSync(path.join(__dirname, '../../.test-state.json'), JSON.stringify({ database }));
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
    server.use(express.static(path.join(__dirname, '../../frontend/build')));
    server.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, '../../frontend/build/index.html')));
    listener = server.listen(3300, '127.0.0.1', () => console.log('Servidor E2E pronto em 3300; banco temporário isolado.'));
})().catch(error => { console.error(error.message); process.exit(1); });
