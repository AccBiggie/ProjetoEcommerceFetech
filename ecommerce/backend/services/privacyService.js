const crypto = require('node:crypto');
const User = require('../models/userModel');
const Address = require('../models/addressModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Request = require('../models/privacyRequestModel');
const Task = require('../models/mediaCleanupTaskModel');
const { withPrivacySensitiveWrite } = require('./privacySensitiveWrite');
const { runAuditedAdminMutation } = require('./adminAuditService');
const { createAdminMutationLock } = require('./adminMutationLock');
const { isActive } = require('../utils/userLifecycle');
const { isValidVersion } = require('../utils/authSession');
const { isManagedAvatarPublicId } = require('../utils/mediaContract');
const { REMOVED_NAME, defaultAvatar, fail, isAnonymized } = require('../utils/privacyContract');
const lock = createAdminMutationLock();
const publicRequest = request => request ? { _id: String(request._id), type: request.type, status: request.status, requestedAt: request.requestedAt, completedAt: request.completedAt, cancelledAt: request.cancelledAt } : null;
async function requestAnonymization(req) {
    await Request.init();
    await require('./email/enqueue').modelFor(User.db).init();
    return withPrivacySensitiveWrite(req.user, async (session, user) => {
        const existing = await Request.findOne({ user: user._id, status: 'REQUESTED' }).session(session);
        if (existing) return { request: publicRequest(existing), created: false };
        const [request] = await Request.create([{ user: user._id, requestId: req.requestId }], { session });
        user.privacyStatus = 'ANONYMIZATION_REQUESTED'; await user.save({ session });
        await require('./email/enqueue').enqueue({ eventType: 'PRIVACY_REQUEST_CREATED', recipientUserId: user._id, entityId: request._id, requestId: req.requestId }, session, User.db);
        return { request: publicRequest(request), created: true };
    });
}
async function latest(user) { return publicRequest(await Request.findOne({ user }).sort({ createdAt: -1, _id: -1 }).lean()); }
async function cancel(req) {
    return withPrivacySensitiveWrite(req.user, async (session, user) => {
        const request = await Request.findOne({ user: user._id, status: 'REQUESTED' }).session(session);
        if (!request) fail('PRIVACY_REQUEST_NOT_ACTIVE');
        request.status = 'CANCELLED'; request.cancelledAt = new Date(); await request.save({ session });
        user.privacyStatus = 'NORMAL'; await user.save({ session }); return publicRequest(request);
    });
}
async function anonymize(req) {
    await Request.init(); await Task.init();
    // Share the F010 Mongo lease with role/deactivation/reactivation operations.
    // A local mutex would allow another instance to reactivate/promote the target.
    const result = await lock.run(async lease => {
        await lock.assertHeld(lease);
        return runAuditedAdminMutation(req, async session => {
            const executor = await User.findById(req.user._id).session(session);
            if (!isActive(executor) || executor.role !== 'admin') fail('PRIVACY_ADMIN_REQUIRED', 403);
            const request = await Request.findById(req.params.id).session(session);
            if (!request) fail('PRIVACY_REQUEST_NOT_FOUND', 404);
            if (req.body.confirmation !== 'ANONIMIZAR ' + request.user) fail('PRIVACY_CONFIRMATION_INVALID', 400);
            const user = await User.findById(request.user).select('+password').session(session);
            if (!user) fail('PRIVACY_USER_NOT_FOUND', 409);
            if (request.status === 'COMPLETED' && isAnonymized(user)) return { value: { request: publicRequest(request), applied: false, taskId: null } };
            if (request.status !== 'REQUESTED') fail('PRIVACY_REQUEST_NOT_ACTIVE');
            if (isAnonymized(user)) fail('USER_ANONYMIZED');
            if (user.role === 'admin') fail('PRIVACY_USER_ADMIN');
            if (user.accountStatus !== 'DEACTIVATED') fail('PRIVACY_USER_ACTIVE');
            if (user.privacyStatus !== 'ANONYMIZATION_REQUESTED' || !isValidVersion(user.tokenVersion) || user.tokenVersion >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(user.avatarRevision) || user.avatarRevision >= Number.MAX_SAFE_INTEGER) fail('PRIVACY_USER_STATE_INVALID');
            // A write to the executor also conflicts with a later F010 lease's
            // fencing/demotion. A snapshot read alone would permit write skew
            // if the lease expired between the final check and transaction commit.
            const fencedExecutor = await User.findOneAndUpdate({ $and: [{ _id: executor._id, role: 'admin' },
                require('../utils/userLifecycle').activeFilter(), { $or: [{ adminMutationFence: { $lte: lease.fence } }, { adminMutationFence: { $exists: false } }] }] },
                { $set: { adminMutationFence: lease.fence }, $inc: { privacyMutationVersion: 1 } }, { session, returnDocument: 'after' });
            if (!fencedExecutor) fail('PRIVACY_ADMIN_REQUIRED', 403);
            const oldAvatar = user.avatar, managed = isManagedAvatarPublicId(user._id, oldAvatar?.public_id);
            let task;
            if (managed || oldAvatar?.public_id && oldAvatar.public_id !== 'default-avatar' && oldAvatar.url !== '/Profile.png') {
                task = await Task.findOneAndUpdate({ provider: 'CLOUDINARY', publicId: oldAvatar.public_id },
                    { $set: { status: managed ? 'PENDING' : 'BLOCKED', failureCode: managed ? null : 'LEGACY_UNMANAGED_AVATAR' },
                        $setOnInsert: { user: user._id, reason: 'ACCOUNT_ANONYMIZATION' } }, { upsert: true, session, returnDocument: 'after' });
            }
            user.name = REMOVED_NAME; user.email = `anon-${crypto.randomUUID()}@privacy.invalid`;
            user.password = crypto.randomBytes(48).toString('hex'); user.tokenVersion++;
            user.resetPasswordToken = undefined; user.resetPasswordExpire = undefined;
            user.avatar = defaultAvatar(); user.avatarRevision++; user.privacyStatus = 'ANONYMIZED';
            await user.save({ session });
            await Address.deleteMany({ user: user._id }, { session });
            await Product.updateMany({ 'reviews.user': user._id }, { $set: { 'reviews.$[review].name': REMOVED_NAME } }, { session, arrayFilters: [{ 'review.user': user._id }] });
            request.status = 'COMPLETED'; request.completedAt = new Date(); request.processedBy = req.user._id; await request.save({ session });
            await lock.assertHeld(lease);
            return { value: { request: publicRequest(request), applied: true, taskId: managed && task ? task._id : null },
                event: { action: 'USER_ANONYMIZED', targetId: user._id, metadata: { privacyRequestId: String(request._id) } } };
        });
    });
    if (result.taskId) await require('./avatarMediaService').createAvatarMediaService().cleanup(result.taskId).catch(() =>
        require('../observability/logger').warn('media.cleanup.pending', { cleanupTaskId: String(result.taskId), failureCode: 'MEDIA_DB_UNAVAILABLE' }));
    return { request: result.request, applied: result.applied };
}
async function overview(user) {
    const [addresses, orders, reviews] = await Promise.all([
        Address.countDocuments({ user }), Order.countDocuments({ user }),
        Product.aggregate([{ $match: { 'reviews.user': user } }, { $project: { count: { $size: { $filter: { input: '$reviews', as: 'r', cond: { $eq: ['$$r.user', user] } } } } } }, { $group: { _id: null, count: { $sum: '$count' } } }]),
    ]);
    return { profile: true, addresses, orders, reviews: reviews[0]?.count || 0, historicalRetention: 'UNDEFINED' };
}
module.exports = { requestAnonymization, latest, cancel, anonymize, overview, publicRequest };
