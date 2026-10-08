const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const mongoose = require('mongoose');
const defaults = require('../config/adminSafety');
const DefaultModel = require('../models/adminMutationLockModel');
const ErrorHander = require('../utils/errorHander');
const conflict = () => new ErrorHander('Outra alteração administrativa está em andamento. Tente novamente.', 409);
const unavailable = () => new ErrorHander('Administração temporariamente indisponível. Tente novamente.', 503);

function createAdminMutationLock({ Model = DefaultModel, leaseMs = defaults.leaseMs,
    acquireTimeoutMs = defaults.acquireTimeoutMs, retryMs = defaults.retryMs } = {}) {
    const id = 'admin-user-mutation', options = { maxTimeMS: defaults.mongoTimeoutMs };
    const owned = lease => ({ _id: id, owner: lease.owner, fence: lease.fence,
        $expr: { $gt: ['$lockedUntil', '$$NOW'] } });
    async function acquire() {
        const owner = crypto.randomUUID(), deadline = performance.now() + acquireTimeoutMs;
        try {
            // Inicialização separada permite usar $$NOW na aquisição sem upsert/$expr.
            try {
                await Model.collection.updateOne({ _id: id }, { $setOnInsert: {
                    owner: null, lockedUntil: new Date(0), fence: 0,
                    bootstrapUserId: new mongoose.Types.ObjectId(), createdAt: new Date(),
                } }, { ...options, upsert: true });
            } catch (error) { if (error.code !== 11000) throw error; }
            do {
                const doc = await Model.collection.findOneAndUpdate({ _id: id,
                    fence: { $lt: Number.MAX_SAFE_INTEGER },
                    $or: [{ owner: null }, { $expr: { $lte: ['$lockedUntil', '$$NOW'] } }],
                }, [{ $set: { owner: { $literal: owner }, lockedUntil: { $add: ['$$NOW', leaseMs] },
                    fence: { $add: ['$fence', 1] }, updatedAt: '$$NOW' } }],
                { ...options, returnDocument: 'after', includeResultMetadata: false });
                if (doc) return { id, owner, fence: doc.fence, bootstrapUserId: doc.bootstrapUserId };
                if (performance.now() >= deadline) break;
                await sleep(Math.min(retryMs, Math.max(1, deadline - performance.now())));
            } while (performance.now() <= deadline);
        } catch { throw unavailable(); }
        throw conflict();
    }
    async function assertHeld(lease) {
        let doc;
        try { doc = await Model.collection.findOne(owned(lease), options); }
        catch { throw unavailable(); }
        if (!doc) throw conflict();
    }
    async function release(lease) {
        try {
            await Model.collection.updateOne({ _id: id, owner: lease.owner, fence: lease.fence },
                { $set: { owner: null, lockedUntil: new Date(0), updatedAt: new Date() } }, options);
        } catch { throw unavailable(); }
    }
    async function rotateBootstrapId(lease) {
        let doc;
        try { doc = await Model.collection.findOneAndUpdate(owned(lease),
            { $set: { bootstrapUserId: new mongoose.Types.ObjectId() } },
            { ...options, returnDocument: 'after', includeResultMetadata: false }); }
        catch { throw unavailable(); }
        if (!doc) throw conflict();
        return doc.bootstrapUserId;
    }
    async function run(callback) {
        const lease = await acquire();
        try { return await callback(lease); }
        finally { await release(lease); }
    }
    return { acquire, assertHeld, release, rotateBootstrapId, run };
}
module.exports = { createAdminMutationLock, conflict };
