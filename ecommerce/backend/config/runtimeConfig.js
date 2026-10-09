const { getAllowedOrigins } = require('./csrf');
const { getTrustProxySetting } = require('./trustProxy');
const { getAuthCookieOptions } = require('./authCookie');
const jwt = require('jsonwebtoken');
const policies = require('./authRateLimits');
class ConfigurationError extends Error {
    constructor(issues) {
        super('Falha na configuração da aplicação:\n' + issues.map(({ variable, reason }) => `- ${variable}: ${reason}`).join('\n'));
        this.name = 'ConfigurationError';
        this.issues = Object.freeze(issues.map(issue => Object.freeze(issue)));
    }
}
function loadConfig(env, { profile = 'server' } = {}) {
    const issues = [];
    const bad = (variable, reason) => issues.push({ variable, reason });
    const text = name => typeof env[name] === 'string' ? env[name].trim() : '';
    const supplied = name => env[name] !== undefined;
    const required = name => { if (!text(name)) bad(name, 'obrigatória e não vazia'); return text(name); };
    const integer = (name, fallback, min, max) => {
        if (!supplied(name)) return fallback;
        if (typeof env[name] !== 'string' || !/^\d+$/.test(env[name]) || !Number.isSafeInteger(Number(env[name])) || Number(env[name]) < min || Number(env[name]) > max) {
            bad(name, `deve ser inteiro entre ${min} e ${max}`); return fallback;
        }
        return Number(env[name]);
    };
    for (const name of ['NODE_ENV','PORT','DB_URI','JWT_SECRET','JWT_EXPIRE','COOKIE_EXPIRE','FRONTEND_URL','TRUST_PROXY_HOPS','AUTH_FORGOT_MIN_RESPONSE_MS','HOST','PORTEMAIL','EMAIL_SECURE','USER','PASSWORD','CLOUDINARY_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','LOG_LEVEL']) {
        if (supplied(name) && typeof env[name] !== 'string') bad(name, 'deve ser string de ambiente');
    }
    const environment = supplied('NODE_ENV') ? text('NODE_ENV') : 'development';
    if (!['development','test','production'].includes(environment)) bad('NODE_ENV','use development, test ou production');
    if (!['server','bootstrap','seed','migration','shipping-audit','inventory-audit','orders-audit','users-audit','reviews-audit','categories-audit','media-audit','media-reconcile','database-operations'].includes(profile)) bad('PROFILE','perfil desconhecido');
    const production = environment === 'production';
    const logLevel = supplied('LOG_LEVEL') ? env.LOG_LEVEL : environment === 'test' ? 'error' : 'info';
    if (!['debug','info','warn','error'].includes(logLevel)) bad('LOG_LEVEL','use debug, info, warn ou error');
    const uri = required('DB_URI');
    if (uri) {
        try {
            // O parser do driver já instalado valida replica sets, IPv6 e opções sem abrir sockets.
            const client = new (require('mongoose').mongo.MongoClient)(uri);
            const path = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
            const database = path && decodeURIComponent(path[1]);
            if (!database || /[\/\\\s.$]/.test(database) || /[\s\\]/.test(uri) || uri.includes('#') ||
                (production && client.options.dbName.toLowerCase() === 'test')) throw new Error();
        } catch { bad('DB_URI','use URI mongodb:// ou mongodb+srv:// válida com database explícita; production não aceita database test'); }
    }
    if (profile !== 'server') {
        let cloudinary;
        if (profile === 'media-reconcile') {
            const names = ['CLOUDINARY_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'];
            const enabled = names.some(name => text(name));
            if (enabled) for (const name of names) required(name);
            cloudinary = Object.freeze({ enabled, cloud_name: text(names[0]), api_key: text(names[1]), api_secret: env.CLOUDINARY_API_SECRET });
        }
        if (issues.length) throw new ConfigurationError(issues);
        return Object.freeze({ profile, environment, logging: Object.freeze({ level: logLevel }), mongo: Object.freeze({ uri }), ...(cloudinary ? { cloudinary } : {}) });
    }
    const port = integer('PORT', 4000, 1, 65535);
    let hops = 0;
    try { hops = getTrustProxySetting(env.TRUST_PROXY_HOPS) || 0; } catch { bad('TRUST_PROXY_HOPS','deve ser inteiro entre 0 e 5'); }
    const secret = env.JWT_SECRET;
    if (typeof secret !== 'string' || !secret.trim()) bad('JWT_SECRET','obrigatória e não vazia; não existe secret default');
    else if (production && (Buffer.byteLength(secret) < 32 || secret.trim() !== secret ||
        /secret|changeme|change.me|password|placeholder|substitua|gere.um|<|>|your.jwt|^test$/i.test(secret))) bad('JWT_SECRET','comprimento mínimo de 32 bytes, sem placeholder ou espaços nas extremidades');
    const expiresIn = required('JWT_EXPIRE');
    if (expiresIn) {
        // Usar o próprio consumidor preserva o contrato de durações (strings numéricas são ms).
        try {
            const token = jwt.sign({}, 'fixture-validation-only', { expiresIn });
            const decoded = jwt.decode(token);
            if (!Number.isSafeInteger(decoded.exp) || decoded.exp <= decoded.iat || decoded.exp * 1000 > 8640000000000000) throw new Error();
        } catch { bad('JWT_EXPIRE','deve representar expiração positiva aceita por jsonwebtoken, de pelo menos um segundo'); }
    }
    let expireDays;
    try { getAuthCookieOptions({ nodeEnv: environment, cookieExpire: env.COOKIE_EXPIRE }); expireDays = Number(env.COOKIE_EXPIRE); }
    catch { bad('COOKIE_EXPIRE','deve ser duração finita positiva em dias, com data representável'); }
    let origin, allowedOrigins = [];
    try {
        allowedOrigins = [...getAllowedOrigins({ nodeEnv: environment, frontendUrl: env.FRONTEND_URL })];
        origin = text('FRONTEND_URL') ? new URL(env.FRONTEND_URL).origin : 'http://localhost:3000';
    } catch { bad('FRONTEND_URL','use URL absoluta sem credenciais ou wildcard, HTTPS obrigatória em production'); }
    const minimumResponseMs = integer('AUTH_FORGOT_MIN_RESPONSE_MS', 300, 0, 5000);
    const group = (names, mandatory) => {
        const active = names.some(name => text(name));
        if (active || mandatory) for (const name of names) required(name);
        return active || mandatory;
    };
    // EMAIL_SECURE sozinho também indica intenção de configurar SMTP.
    const smtpEnabled = group(['HOST','PORTEMAIL','USER','PASSWORD'], production || !!text('EMAIL_SECURE'));
    const smtpPort = text('PORTEMAIL') ? integer('PORTEMAIL', undefined, 1, 65535) : undefined;
    let secure = smtpPort === 465;
    if (supplied('EMAIL_SECURE') && text('EMAIL_SECURE')) {
        if (!['true','false'].includes(env.EMAIL_SECURE)) bad('EMAIL_SECURE','use somente true ou false');
        else secure = env.EMAIL_SECURE === 'true';
    }
    if (smtpEnabled && text('HOST') && !/^[a-z\d.-]+$/i.test(text('HOST'))) bad('HOST','deve ser hostname SMTP, sem protocolo ou credenciais');
    const cloudinaryEnabled = group(['CLOUDINARY_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'], false);
    for (const name of ['PASSWORD','CLOUDINARY_API_SECRET']) if (text(name) && production && env[name] !== text(name)) bad(name,'não use espaços nas extremidades');
    if (issues.length) throw new ConfigurationError(issues);
    return Object.freeze({ profile, environment, port, logging: Object.freeze({ level: logLevel }), mongo: Object.freeze({ uri }),
        jwt: Object.freeze({ secret, expiresIn }), cookie: Object.freeze({ expireDays }),
        frontend: Object.freeze({ origin, allowedOrigins: Object.freeze(allowedOrigins) }), proxy: Object.freeze({ hops }),
        auth: Object.freeze({ minimumResponseMs, rateLimits: policies }),
        smtp: Object.freeze({ enabled: smtpEnabled, host: text('HOST'), port: smtpPort, secure, user: text('USER'), password: env.PASSWORD }),
        cloudinary: Object.freeze({ enabled: cloudinaryEnabled, cloud_name: text('CLOUDINARY_NAME'), api_key: text('CLOUDINARY_API_KEY'), api_secret: env.CLOUDINARY_API_SECRET }) });
}
let runtime;
function initializeConfig(env, options) { const validated = loadConfig(env, options); runtime = validated; return validated; }
function getRuntimeConfig() { return runtime || initializeConfig(process.env); }
function loadEnvironment() { require('dotenv').config({ path: require('node:path').join(__dirname, 'config.env'), quiet: true }); }
module.exports = { ConfigurationError, loadConfig, initializeConfig, getRuntimeConfig, loadEnvironment };
