const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { password } = require('./fixtures');
const { withCsrf } = require('./httpHeaders');
const User = require('../backend/models/userModel');

Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '4000', TRUST_PROXY_HOPS: '0',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRE: '7d', COOKIE_EXPIRE: '7',
    FRONTEND_URL: 'http://127.0.0.1:3300', EMAIL_SECURE: 'false', HOST: 'smtp.test', USER: 'test', PASSWORD: 'test',
    PORTEMAIL: '587', CLOUDINARY_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
    AUTH_FORGOT_MIN_RESPONSE_MS: process.env.AUTH_FORGOT_MIN_RESPONSE_MS ?? '20',
});
const mails = [];
let transportFailure = false;
nodemailer.createTransport = () => ({ sendMail: async mail => {
    if (transportFailure) throw new Error('SMTP de teste indisponível');
    mails.push(mail);
} });
const database = `fetech_routes_auth_${process.pid}_${Date.now()}`;
process.env.DB_URI = `mongodb://127.0.0.1:27017/${database}`;
const runtime = require('../backend/config/runtimeConfig');
const fixtureEnv = { ...process.env };
runtime.initializeConfig(fixtureEnv);
function configure(overrides = {}) { return runtime.initializeConfig({ ...fixtureEnv, ...overrides }); }
const app = require('../backend/app');
let server, base, sequence = 0;

async function start() {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`);
    await User.init();
    if (mongoose.models.AuthRateLimit) await mongoose.models.AuthRateLimit.init();
    if (mongoose.models.AdminMutationLock) await mongoose.models.AdminMutationLock.init();
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
}
async function stop() {
    try {
        if (server) await new Promise(resolve => server.close(resolve));
    } finally {
        try {
            if (mongoose.connection.name === database && database.startsWith('fetech_routes_auth_')) {
                await mongoose.connection.dropDatabase();
            }
        } finally { await mongoose.disconnect(); }
    }
}
async function request(method, route, body, cookie, expected, extraHeaders = {}) {
    const headers = withCsrf(method, extraHeaders);
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000) });
    const result = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json() : await response.text();
    // Nunca incluir corpo, cookie ou URL de recuperação em falhas de asserção.
    if (expected !== undefined) assert.equal(response.status, expected, `${method}: status HTTP inesperado`);
    return { response, result, status: response.status };
}
function extractCookieValue(setCookie, name = 'token') {
    for (const header of Array.isArray(setCookie) ? setCookie : [setCookie]) {
        if (typeof header !== 'string') continue;
        const pair = header.split(';')[0], separator = pair.indexOf('=');
        if (pair.slice(0, separator).trim() === name) return decodeURIComponent(pair.slice(separator + 1));
    }
    return undefined;
}
function cookieOf(reply) {
    const value = extractCookieValue(reply.response.headers.getSetCookie());
    assert.ok(Boolean(value), 'Cookie de sessão ausente');
    return 'token=' + encodeURIComponent(value);
}
async function createUser(role = 'user') {
    return User.create({ name: 'Cliente de sessão', email: `session${++sequence}@routes.example.com`, password,
        role, avatar: { public_id: 'test-avatar', url: '/Profile.png' } });
}
async function login(user, currentPassword = password) {
    return cookieOf(await request('POST', '/login', { email: user.email, password: currentPassword }, null, 200));
}
function signedCookie(user, claims = {}, options = {}) {
    return 'token=' + jwt.sign({ id: user.id, ...claims }, process.env.JWT_SECRET, { expiresIn: '7d', ...options });
}
async function recoveryToken(user) {
    await request('POST', '/password/forgot', { email: user.email }, null, 200);
    const match = mails.at(-1).text.match(/password\/reset\/([a-f0-9]+)/);
    assert.ok(match, 'Link de recuperação ausente');
    return match[1];
}
module.exports = { configure, start, stop, request, cookieOf, extractCookieValue, createUser, login, signedCookie, recoveryToken,
    User, jwt, password, database, setTransportFailure: value => { transportFailure = value; },
    mailCount: () => mails.length,
    clearRateLimits: () => mongoose.connection.collection('authratelimits').deleteMany({}),
};
