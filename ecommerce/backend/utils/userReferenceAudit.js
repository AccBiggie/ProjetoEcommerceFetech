// Native read APIs avoid model defaults and detect actual legacy/malformed records.
const objectId = value => value?._bsontype === 'ObjectId';
async function auditUserReferences(connection, { write = console.log } = {}) {
    const users = connection.db.collection('users'), issues = [];
    const summary = { mode: 'READ_ONLY', users: 0, active: 0, deactivated: 0, references: 0, issues: 0 };
    const add = (category, relation, id, target) => issues.push({ category, relation, missingTargetType: 'User', id: objectId(id) ? String(id) : null,
        missingUserId: objectId(target) ? String(target) : null });
    async function reference(relation, id, target, optional = false) {
        if (optional && target == null) return;
        summary.references++;
        if (!objectId(target)) add('INVALID_USER_REFERENCE', relation, id, target);
        else if (!await users.findOne({ _id: target }, { projection: { _id: 1 } })) add('ORPHAN_USER_REFERENCE', relation, id, target);
    }
    for await (const user of users.find({}, { projection: { _id: 1, accountStatus: 1, deactivatedAt: 1, deactivatedBy: 1 } })) {
        summary.users++;
        const status = user.accountStatus === undefined ? 'ACTIVE' : user.accountStatus;
        if (status === 'ACTIVE') {
            summary.active++;
            if (user.deactivatedAt != null || user.deactivatedBy != null) add('INVALID_LIFECYCLE_METADATA', 'User.lifecycle', user._id);
        } else if (status === 'DEACTIVATED') {
            summary.deactivated++;
            if (!(user.deactivatedAt instanceof Date) || !Number.isFinite(user.deactivatedAt.getTime()) || !objectId(user.deactivatedBy)) add('INVALID_LIFECYCLE_METADATA', 'User.lifecycle', user._id);
        } else add('INVALID_ACCOUNT_STATUS', 'User.accountStatus', user._id);
        await reference('User.deactivatedBy', user._id, user.deactivatedBy, true);
    }
    for (const [collection, fields] of [
        ['addresses', [['user', 'Address.user', false]]],
        ['orders', [['user', 'Order.user', false], ['administrativeArchivedBy', 'Order.administrativeArchivedBy', true], ['cancelledByUserId', 'Order.cancelledByUserId', true]]],
        ['orderidempotencies', [['user', 'OrderIdempotency.user', false]]],
        ['adminauditevents', [['actorUserId', 'AdminAuditEvent.actorUserId', false]]],
        // Product.user's legacy schema uses `require`, so absence is optional;
        // an existing reference must still resolve.
        ['products', [['user', 'Product.user', true]]],
    ]) {
        const projection = Object.fromEntries(['_id', ...fields.map(field => field[0]), ...(collection === 'products' ? ['reviews._id', 'reviews.user'] : [])].map(field => [field, 1]));
        for await (const row of connection.db.collection(collection).find({}, { projection })) {
            for (const [field, relation, optional] of fields) await reference(relation, row._id, row[field], optional);
            if (collection === 'products') for (const review of row.reviews || []) await reference('Product.reviews.user', review._id || row._id, review.user);
        }
    }
    // bootstrapUserId is a reserved future ID, not an existing-user foreign key.
    // Audit targetId is a polymorphic historical identifier (including USER_DELETED).
    summary.issues = issues.length;
    write(JSON.stringify(summary));
    for (const issue of issues) write(JSON.stringify(issue));
    return { summary, issues };
}
module.exports = { auditUserReferences };
