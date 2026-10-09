// Missing status is the only legacy value accepted as ACTIVE. Unknown values fail closed.
const activeFilter = () => ({ $and: [{ $or: [{ accountStatus: 'ACTIVE' }, { accountStatus: { $exists: false } }] }, { $or: [{ privacyStatus: { $in: ['NORMAL', 'ANONYMIZATION_REQUESTED'] } }, { privacyStatus: { $exists: false } }] }, { $expr: { $in: [{ $type: '$privacyStatus' }, ['missing', 'string']] } }] });
const isActive = user => Boolean(user && (user.accountStatus === undefined || user.accountStatus === 'ACTIVE') && ['NORMAL', 'ANONYMIZATION_REQUESTED'].includes(require('./privacyContract').privacyStatusOf(user)));
const statusOf = user => user.accountStatus === undefined ? 'ACTIVE' : user.accountStatus;
function publicUser(user) {
    const result = user.toObject ? user.toObject() : { ...user };
    for (const key of ['password', 'resetPasswordToken', 'resetPasswordExpire', 'adminMutationFence', 'avatarRevision', 'privacyMutationVersion', 'deactivatedBy', 'deactivatedAt']) delete result[key];
    result.accountStatus = statusOf(user);
    result.privacyStatus = require('./privacyContract').privacyStatusOf(user);
    return result;
}
function adminUser(user) {
    return { ...publicUser(user), deactivatedAt: user.deactivatedAt ?? null, deactivatedBy: user.deactivatedBy ?? null };
}
module.exports = { activeFilter, isActive, statusOf, publicUser, adminUser };
