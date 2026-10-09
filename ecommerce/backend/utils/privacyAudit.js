const { REMOVED_NAME, aliasPattern, privacyStatusOf } = require('./privacyContract');
async function auditPrivacy(connection, { write = console.log, now = new Date() } = {}) {
    const session = await connection.startSession({ snapshot: true });
    const db = connection.db, issues = [];
    const summary = { mode: 'READ_ONLY', users: 0, anonymized: 0, historicalOrdersWithShipping: 0, historicalRetention: 'UNDEFINED', issues: 0 };
    const add = (code, id) => issues.push({ code, id: id?._bsontype === 'ObjectId' ? String(id) : null });
    try {
        for await (const user of db.collection('users').find({}, { session, projection: { _id: 1, name: 1, email: 1, privacyStatus: 1, accountStatus: 1, role: 1, resetPasswordToken: 1, resetPasswordExpire: 1, avatar: 1 } })) {
            summary.users++;
            const pending = await db.collection('privacyrequests').countDocuments({ user: user._id, status: 'REQUESTED' }, { session });
            if (pending > 1 || (privacyStatusOf(user) === 'ANONYMIZATION_REQUESTED') !== (pending === 1)) add('PRIVACY_REQUEST_INCONSISTENT', user._id);
            if (privacyStatusOf(user) !== 'ANONYMIZED') continue;
            summary.anonymized++;
            if (!aliasPattern.test(user.email || '')) add('ANONYMIZED_USER_WITH_REAL_EMAIL', user._id);
            if (user.name !== REMOVED_NAME) add('ANONYMIZED_USER_WITH_REAL_NAME', user._id);
            if (user.accountStatus !== 'DEACTIVATED' || user.role === 'admin') add('ANONYMIZED_USER_ACTIVE', user._id);
            if (user.resetPasswordToken || user.resetPasswordExpire) add('ANONYMIZED_USER_WITH_RESET_TOKEN', user._id);
            if (user.avatar?.public_id !== 'default-avatar' || user.avatar?.url !== '/Profile.png') add('ANONYMIZED_USER_WITH_MANAGED_AVATAR', user._id);
            if (await db.collection('addresses').countDocuments({ user: user._id }, { session })) add('ANONYMIZED_USER_WITH_ADDRESS', user._id);
            if (await db.collection('products').countDocuments({ reviews: { $elemMatch: { user: user._id, name: { $ne: REMOVED_NAME } } } }, { session })) add('ANONYMIZED_USER_REVIEW_NAME', user._id);
        }
        for await (const request of db.collection('privacyrequests').find({}, { session, projection: { _id: 1, user: 1, status: 1, completedAt: 1, cancelledAt: 1, processedBy: 1 } })) {
            const user = await db.collection('users').findOne({ _id: request.user }, { session, projection: { privacyStatus: 1 } });
            if (!user || !['REQUESTED', 'COMPLETED', 'CANCELLED'].includes(request.status) || request.status === 'COMPLETED' && (!request.completedAt || !request.processedBy || request.cancelledAt || user.privacyStatus !== 'ANONYMIZED') || request.status === 'CANCELLED' && (!request.cancelledAt || request.completedAt || request.processedBy) || request.status === 'REQUESTED' && (request.completedAt || request.cancelledAt || request.processedBy)) add('PRIVACY_REQUEST_INCONSISTENT', request._id);
        }
        for await (const bucket of db.collection('authratelimits').find({ expiresAt: { $lt: now } }, { session, projection: { _id: 0, expiresAt: 1 } })) add('EXPIRED_SECURITY_RATE_LIMIT_RECORD', null);
        summary.historicalOrdersWithShipping = await db.collection('orders').countDocuments({ shippingInfo: { $exists: true } }, { session });
        summary.issues = issues.length; write(JSON.stringify(summary)); for (const issue of issues) write(JSON.stringify(issue)); return { summary, issues };
    } finally { await session.endSession(); }
}
module.exports = { auditPrivacy };
