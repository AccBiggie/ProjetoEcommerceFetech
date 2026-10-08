const AuthRateLimit = require('../models/authRateLimitModel');

function createMongoRateLimitStore(model = AuthRateLimit) {
    async function acquire(rule, now, reserve) {
        const started = new Date(now), expires = new Date(now + rule.windowMs);
        const expired = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, started] };
        const field = reserve ? 'pending' : 'count';
        const pipeline = [
            { $set: {
                scope: { $literal: rule.scope },
                count: { $cond: [expired, 0, '$count'] },
                pending: { $cond: [expired, 0, '$pending'] },
                windowStartedAt: { $cond: [expired, started, '$windowStartedAt'] },
                expiresAt: { $cond: [expired, expires, '$expiresAt'] },
            } },
            { $set: { [field]: { $cond: [
                { $lt: [{ $add: ['$count', '$pending'] }, rule.limit] },
                { $add: ['$' + field, 1] }, '$' + field,
            ] } } },
        ];
        let previous;
        for (let attempt = 0; ; attempt++) {
            try {
                previous = await model.collection.findOneAndUpdate({ _id: rule.key }, pipeline,
                    { upsert: true, returnDocument: 'before', includeResultMetadata: false, maxTimeMS: 5000 });
                break;
            } catch (error) {
                // Apenas a disputa pela primeira inserção da chave é repetida.
                if (error.code !== 11000 || attempt >= 2) throw error;
            }
        }
        const active = previous && previous.expiresAt.getTime() > now;
        return {
            ...rule,
            allowed: !active || previous.count + previous.pending < rule.limit,
            windowStartedAt: active ? previous.windowStartedAt : started,
            expiresAt: active ? previous.expiresAt : expires,
        };
    }

    async function settle(reservation, now, outcome) {
        const update = { $inc: { pending: -1 } };
        if (outcome === 'failure') update.$inc.count = 1;
        if (outcome === 'success' && reservation.dimension !== 'ip') update.$set = { count: 0 };
        await model.collection.updateOne({ _id: reservation.key,
            windowStartedAt: reservation.windowStartedAt, expiresAt: { $gt: new Date(now) },
            pending: { $gt: 0 } }, update, { maxTimeMS: 5000 });
    }
    return { acquire, settle };
}

module.exports = { createMongoRateLimitStore };
