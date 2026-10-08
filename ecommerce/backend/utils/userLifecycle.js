// Missing status is the only legacy value accepted as ACTIVE. Unknown values fail closed.
const activeFilter = () => ({ $or: [{ accountStatus: 'ACTIVE' }, { accountStatus: { $exists: false } }] });
const isActive = user => Boolean(user && (user.accountStatus === undefined || user.accountStatus === 'ACTIVE'));
const statusOf = user => user.accountStatus === undefined ? 'ACTIVE' : user.accountStatus;
function publicUser(user) {
    const result = user.toObject ? user.toObject() : { ...user };
    for (const key of ['password', 'resetPasswordToken', 'resetPasswordExpire', 'adminMutationFence', 'deactivatedBy', 'deactivatedAt']) delete result[key];
    result.accountStatus = statusOf(user);
    return result;
}
function adminUser(user) {
    return { ...publicUser(user), deactivatedAt: user.deactivatedAt ?? null, deactivatedBy: user.deactivatedBy ?? null };
}
module.exports = { activeFilter, isActive, statusOf, publicUser, adminUser };
