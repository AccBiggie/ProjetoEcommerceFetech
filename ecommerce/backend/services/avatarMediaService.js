const mongoose = require('mongoose');
const User = require('../models/userModel');
const Intent = require('../models/mediaUploadIntentModel');
const Task = require('../models/mediaCleanupTaskModel');
const { activeFilter } = require('../utils/userLifecycle');
const { versionFilter, invalidSession } = require('../utils/authSession');
const { error, managedId, isManagedAvatarPublicId, providerResult, GRACE_MS } = require('../utils/mediaContract');
const logger = require('../observability/logger');
const txOptions = { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000, timeoutMS: 30000 };
function createAvatarMediaService({ connection = mongoose.connection, provider, now = Date.now, log = logger } = {}) {
    const model = original => connection.models[original.modelName] || connection.model(original.modelName, original.schema);
    const users = model(User), intents = model(Intent), tasks = model(Task);
    const getProvider = () => provider || require('./mediaProvider').getProvider();
    const prepare = async () => { await intents.init(); await tasks.init(); };
    async function transaction(fn) {
        const session = await connection.startSession();
        try { return await session.withTransaction(() => fn(session), txOptions); } finally { await session.endSession(); }
    }
    const references = (publicId, session) => users.exists({ 'avatar.public_id': publicId }).session(session || null);
    async function queue(user, publicId, reason, session) {
        return tasks.findOneAndUpdate({ provider: 'CLOUDINARY', publicId }, { $set: { status: 'PENDING', failureCode: null }, $setOnInsert: { user, kind: 'USER_AVATAR', reason } }, { upsert: true, returnDocument: 'after', session });
    }
    async function cleanup(taskId) {
        await prepare();
        const ready = await transaction(async session => {
            const task = await tasks.findById(taskId).session(session);
            if (!task || task.status === 'COMPLETED') return null;
            if (!isManagedAvatarPublicId(task.user, task.publicId)) {
                await tasks.updateOne({ _id: task._id }, { $set: { status: 'BLOCKED', failureCode: 'LEGACY_UNMANAGED_AVATAR' } }, { session }); return null;
            }
            if (await references(task.publicId, session)) {
                await tasks.updateOne({ _id: task._id }, { $set: { status: 'BLOCKED', failureCode: 'STILL_REFERENCED' } }, { session }); return null;
            }
            const uploading = await intents.exists({ publicId: task.publicId, status: { $in: ['PREPARED', 'UPLOADED'] }, updatedAt: { $gt: new Date(now() - GRACE_MS) } }).session(session);
            if (uploading) { await tasks.updateOne({ _id: task._id }, { $set: { status: 'PENDING', failureCode: 'MEDIA_UPLOAD_IN_PROGRESS' } }, { session }); return null; }
            // Fence attach before leaving Mongo. An upload can only attach while
            // its durable intent is UPLOADED, so check/destroy cannot race attach.
            await intents.updateOne({ publicId: task.publicId, status: { $ne: 'CLEANED' } }, { $set: { status: 'CLEANING' } }, { session });
            await tasks.updateOne({ _id: task._id }, { $inc: { attempts: 1 }, $set: { status: 'PENDING', lastAttemptAt: new Date(now()), failureCode: null } }, { session });
            return { id: task._id, publicId: task.publicId, userId: task.user };
        });
        if (!ready) return;
        try {
            // Reconsult immediately before the external operation; inactive users count too.
            if (await references(ready.publicId)) {
                await tasks.updateOne({ _id: ready.id }, { $set: { status: 'BLOCKED', failureCode: 'STILL_REFERENCED' } });
                log.warn('media.cleanup.blocked', { cleanupTaskId: String(ready.id), failureCode: 'STILL_REFERENCED' }); return;
            }
            const result = await getProvider().destroyImage(ready);
            if (!['ok', 'not found'].includes(result?.result)) throw new Error();
            await transaction(async session => {
                await tasks.updateOne({ _id: ready.id }, { $set: { status: 'COMPLETED', failureCode: null } }, { session });
                await intents.updateOne({ publicId: ready.publicId, status: 'CLEANING' }, { $set: { status: 'CLEANED' } }, { session });
            });
            log.info('media.cleanup.completed', { cleanupTaskId: String(ready.id) });
        } catch {
            await tasks.updateOne({ _id: ready.id }, { $set: { status: 'PENDING', failureCode: 'MEDIA_DESTROY_FAILED' } }).catch(() => {});
            log.warn('media.cleanup.pending', { cleanupTaskId: String(ready.id), failureCode: 'MEDIA_DESTROY_FAILED' });
        }
    }
    async function unattached(intent) {
        // An unknown commit outcome must never lead to deleting the current avatar.
        const task = await transaction(async session => {
            if (await references(intent.publicId, session)) return null;
            await intents.updateOne({ _id: intent._id, status: { $ne: 'ATTACHED' } }, { $set: { status: 'CLEANING' } }, { session });
            return queue(intent.user, intent.publicId, 'UNATTACHED_UPLOAD', session);
        });
        if (task) await cleanup(task._id);
    }
    async function replace({ actor, bytes }) {
        const remote = getProvider(); await prepare();
        const current = await users.collection.findOne({ _id: actor._id });
        if (!current || !await users.exists({ $and: [{ _id: actor._id }, activeFilter(), versionFilter(actor.tokenVersion)] })) throw invalidSession();
        const expected = current.avatarRevision === undefined ? 0 : current.avatarRevision;
        if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) throw error('AVATAR_REPLACE_CONFLICT', 409, 'Atualize o perfil e tente novamente.');
        const intent = await intents.create({ user: actor._id, publicId: managedId(actor._id), expectedAvatarRevision: expected });
        let uploaded = false, attached = false;
        try {
            const result = await remote.uploadAvatar({ bytes, publicId: intent.publicId, userId: actor._id }); uploaded = true;
            const avatar = providerResult(result, intent.publicId);
            const changed = await intents.updateOne({ _id: intent._id, status: 'PREPARED' }, { $set: { status: 'UPLOADED' } });
            if (changed.modifiedCount !== 1) throw error('AVATAR_REPLACE_CONFLICT', 409, 'Atualize o perfil e tente novamente.');
            const value = await transaction(async session => {
                const pending = await intents.findOne({ _id: intent._id, status: 'UPLOADED' }).session(session);
                if (!pending) throw error('AVATAR_REPLACE_CONFLICT', 409, 'Atualize o perfil e tente novamente.');
                const revision = expected === 0 ? { $or: [{ avatarRevision: 0 }, { avatarRevision: { $exists: false } }] } : { avatarRevision: expected };
                const user = await users.findOneAndUpdate({ $and: [{ _id: actor._id }, activeFilter(), versionFilter(actor.tokenVersion), revision] },
                    { $set: { avatar, avatarRevision: expected + 1 } }, { returnDocument: 'before', runValidators: true, session });
                if (!user) {
                    if (!await users.exists({ $and: [{ _id: actor._id }, activeFilter(), versionFilter(actor.tokenVersion)] }).session(session)) throw invalidSession();
                    throw error('AVATAR_REPLACE_CONFLICT', 409, 'Outra foto foi salva. Atualize o perfil e tente novamente.');
                }
                await intents.updateOne({ _id: intent._id, status: 'UPLOADED' }, { $set: { status: 'ATTACHED', failureCode: null } }, { session });
                let oldTask = null;
                if (user.avatar?.public_id !== avatar.public_id && isManagedAvatarPublicId(user._id, user.avatar?.public_id)) oldTask = await queue(user._id, user.avatar.public_id, 'REPLACED_AVATAR', session);
                else if (user.avatar?.public_id && user.avatar.public_id !== 'default-avatar' && user.avatar.url !== '/Profile.png') {
                    const legacyTask = await queue(user._id, user.avatar.public_id, 'REPLACED_AVATAR', session);
                    await tasks.updateOne({ _id: legacyTask._id }, { $set: { status: 'BLOCKED', failureCode: 'LEGACY_UNMANAGED_AVATAR' } }, { session });
                }
                return { user: await users.findById(actor._id).session(session), oldTask };
            });
            attached = true;
            log.info('user.avatar.updated', { userId: String(actor._id), intentId: String(intent._id) });
            if (value.oldTask) await cleanup(value.oldTask._id).catch(() => log.warn('media.cleanup.pending', { cleanupTaskId: String(value.oldTask._id), failureCode: 'MEDIA_DB_UNAVAILABLE' }));
            return value.user;
        } catch (failure) {
            if (!attached) {
                await intents.updateOne({ _id: intent._id, status: { $in: ['PREPARED', 'UPLOADED'] } }, { $set: { failureCode: 'MEDIA_UPLOAD_OR_ATTACH_FAILED' } }).catch(() => {});
                if (uploaded) await unattached(intent).catch(() => {});
                // Ambiguous upload failure keeps PREPARED: reconcile after grace.
                log.warn('user.avatar.upload_failed', { userId: String(actor._id), intentId: String(intent._id), failureCode: 'MEDIA_UPLOAD_OR_ATTACH_FAILED' });
            }
            if (failure.statusCode) throw failure;
            throw error('MEDIA_UPLOAD_FAILED', 502, 'Não foi possível salvar a foto. Tente novamente.');
        }
    }
    async function reconcile({ apply = false, write = console.log } = {}) {
        const report = { mode: apply ? 'APPLY' : 'DRY_RUN', pending: 0, stale: 0, referenced: 0 };
        // Dry run uses native cursors and never initializes indexes/collections.
        const pending = await connection.db.collection('mediacleanuptasks').find({ status: { $in: ['PENDING', 'BLOCKED'] } }).toArray(); report.pending = pending.length;
        for (const task of pending) if (apply) await cleanup(task._id);
        const stale = await connection.db.collection('mediauploadintents').find({ status: { $in: ['PREPARED', 'UPLOADED', 'FAILED', 'CLEANING'] }, updatedAt: { $lte: new Date(now() - GRACE_MS) } }).toArray(); report.stale = stale.length;
        for (const intent of stale) {
            if (await references(intent.publicId)) report.referenced++;
            if (!apply) continue;
            await prepare();
            const task = await transaction(async session => {
                const current = await intents.findOne({ _id: intent._id, status: { $in: ['PREPARED', 'UPLOADED', 'FAILED', 'CLEANING'] }, updatedAt: { $lte: new Date(now() - GRACE_MS) } }).session(session);
                if (!current) return null;
                if (await references(current.publicId, session)) {
                    await intents.updateOne({ _id: current._id }, { $set: { status: 'ATTACHED', failureCode: null } }, { session }); return null;
                }
                if (!isManagedAvatarPublicId(current.user, current.publicId)) return null;
                await intents.updateOne({ _id: current._id }, { $set: { status: 'CLEANING' } }, { session });
                return queue(current.user, current.publicId, 'UNATTACHED_UPLOAD', session);
            });
            if (task) await cleanup(task._id);
        }
        write(JSON.stringify(report)); return report;
    }
    return { replace, cleanup, reconcile, prepare };
}
module.exports = { createAvatarMediaService };
