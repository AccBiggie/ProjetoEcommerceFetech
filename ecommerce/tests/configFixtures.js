const crypto = require('node:crypto');
function configFixture(overrides = {}) {
    return { NODE_ENV: 'test', PORT: '4000', DB_URI: 'mongodb://127.0.0.1:27017/fetech_config_fixture',
        JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRE: '7d', COOKIE_EXPIRE: '7',
        FRONTEND_URL: 'http://shop.example.test', ...overrides };
}
function productionFixture(overrides = {}) {
    return configFixture({ NODE_ENV: 'production', FRONTEND_URL: 'https://shop.example.test',
        HOST: 'smtp.example.test', PORTEMAIL: '587', EMAIL_SECURE: 'false', USER: 'mail@example.test',
        PASSWORD: 'smtp-fixture-value', ...overrides });
}
module.exports = { configFixture, productionFixture };
