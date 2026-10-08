const crypto = require('node:crypto');
const { createMongoRateLimitStore } = require('./mongoAuthRateLimitStore');
const ErrorHander = require('../utils/errorHander');

const unavailable = () => new ErrorHander('Autenticação temporariamente indisponível. Tente novamente mais tarde.', 503);

function createAuthRateLimiter({ store = createMongoRateLimitStore(), policies = require('../config/runtimeConfig').getRuntimeConfig().auth.rateLimits,
    now = Date.now, secret = require('../config/runtimeConfig').getRuntimeConfig().jwt.secret } = {}) {
    function rulesFor(action, { email, ip }) {
        if (typeof secret !== 'string' || !secret) throw unavailable();
        const account = String(email || '').trim().toLowerCase();
        return policies[action].map(rule => {
            const identity = rule.dimension === 'ip' ? [ip]
                : rule.dimension === 'account' ? [account] : [account, ip];
            const key = crypto.createHmac('sha256', secret)
                .update(JSON.stringify(['fetech:auth-rate-limit:v1', rule.scope, ...identity])).digest('hex');
            return { ...rule, key };
        });
    }
    async function settleAll(reservations, outcome) {
        const results = await Promise.allSettled(reservations.map(entry =>
            Promise.resolve().then(() => store.settle(entry, now(), outcome))));
        if (results.some(result => result.status === 'rejected')) throw unavailable();
    }
    async function acquire(action, identity, reserve) {
        const reservations = [];
        let released = false;
        async function release() {
            if (released) return;
            released = true;
            await settleAll(reservations, 'release');
        }
        try {
            for (const rule of rulesFor(action, identity)) {
                const result = await store.acquire(rule, now(), reserve);
                if (!result.allowed) {
                    if (reserve) await release();
                    return { allowed: false, retryAfter: Math.max(1, Math.ceil((result.expiresAt.getTime() - now()) / 1000)) };
                }
                if (reserve) reservations.push(result);
            }
        } catch {
            if (reserve) await release();
            throw unavailable();
        }
        let settled = false;
        return { allowed: true, finish: async success => {
            if (settled || !reserve) return;
            settled = true;
            await settleAll(reservations, success ? 'success' : 'failure');
        } };
    }
    return {
        beginLogin: identity => acquire('login', identity, true),
        consume: (action, identity) => acquire(action, identity, false),
    };
}

module.exports = { createAuthRateLimiter };
