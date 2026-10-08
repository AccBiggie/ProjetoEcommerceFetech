const Audit = require('../models/adminAuditEventModel');
const logger = require('../observability/logger');
const { actions, metadataFor } = require('../observability/auditContract');
const ErrorHander = require('../utils/errorHander');
async function runAuditedAdminMutation(req, mutation, { connection = Audit.db } = {}) {
    // Authorization always comes from authenticated req.user, never ALS.
    if (!req.user || req.user.role !== 'admin') throw new ErrorHander('Permissão administrativa necessária.', 403);
    if (!logger.uuid.test(req.requestId)) throw new Error('Missing server request context');
    await Audit.init();
    const session = await connection.startSession();
    let committed;
    try {
        const value = await session.withTransaction(async () => {
            const result = await mutation(session);
            committed = result.event;
            if (result.event) {
                const { action, targetId, metadata = {} } = result.event;
                await Audit.create([{ eventVersion: 1, createdAt: new Date(), requestId: req.requestId,
                    actorUserId: req.user._id, actorRole: 'admin', action, targetType: actions[action]?.[0], targetId,
                    metadata: metadataFor(action, metadata) }], { session });
            }
            return result.value;
        }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000, timeoutMS: 30000 });
        if (committed) logger.info('admin.action.completed', { action: committed.action, targetType: actions[committed.action][0], targetId: String(committed.targetId) });
        return value;
    } catch (error) { logger.warn('admin.action.failed', { errorName: error.name }); throw error; }
    finally { await session.endSession(); }
}
module.exports = { runAuditedAdminMutation };
