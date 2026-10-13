const User = require('../models/userModel');
const { activeFilter } = require('../utils/userLifecycle');
const { versionFilter, invalidSession } = require('../utils/authSession');
const txOptions = { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000, timeoutMS: 30000 };
async function fencePrivacySensitiveUser(actor, session, connection = User.db) {
    const users = connection.models.User || connection.model('User', User.schema);
    const user = await users.findOneAndUpdate({ $and: [{ _id: actor._id }, activeFilter(), versionFilter(actor.tokenVersion)] },
        { $inc: { privacyMutationVersion: 1 } }, { session, returnDocument: 'after' });
    if (!user) throw invalidSession(); return user;
}
async function withPrivacySensitiveWrite(actor, work, { connection = User.db } = {}) {
    const session = await connection.startSession();
    try {
        const result = await session.withTransaction(async () => {
            session.emailEnqueued = new Map();
            // A real write creates a Mongo conflict with deactivation/anonymization.
            // A stale authenticated request cannot restore an Address/reviewer name later.
            const user = await fencePrivacySensitiveUser(actor, session, connection);
            return work(session, user);
        }, txOptions);
        if (session.emailEnqueued?.size) require('./email/enqueue').logCommitted(session); return result;
    } finally { await session.endSession(); }
}
module.exports = { withPrivacySensitiveWrite, fencePrivacySensitiveUser, txOptions };
