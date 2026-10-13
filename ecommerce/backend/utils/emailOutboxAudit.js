const { events, states, policy } = require('../services/email/contract');
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());
const objectId = value => value?._bsontype === 'ObjectId';
async function audit(connection, { write = console.log, now = new Date() } = {}) {
    const session = await connection.startSession({ snapshot: true }), db = connection.db;
    const issues = [], summary = { mode: 'READ_ONLY', events: 0, operationalIssues: 0, integrityIssues: 0, retentionPeriod: 'UNDEFINED' };
    const add = (code, row, operational = false) => { issues.push({ code, outboxId: row._id?._bsontype === 'ObjectId' ? String(row._id) : null, kind: operational ? 'OPERATIONAL' : 'INTEGRITY' }); summary[operational ? 'operationalIssues' : 'integrityIssues']++; };
    try {
        for await (const row of db.collection('emailoutboxes').find({}, { session })) {
            summary.events++;
            if (!states.includes(row.status) || !events.includes(row.eventType) || row.schemaVersion !== 1 || !Number.isSafeInteger(row.attempts) || row.attempts < 0 || row.attempts > policy.maxAttempts || !validDate(row.nextAttemptAt) || !objectId(row.recipientUserId) || !objectId(row.entityId) ||
                (row.status === 'PROCESSING' ? !require('../observability/logger').uuid.test(row.leaseToken) || !validDate(row.leaseExpiresAt) : row.leaseToken != null || row.leaseExpiresAt != null) ||
                (row.status === 'SENT' ? !validDate(row.sentAt) : row.sentAt != null) ||
                (row.status === 'SUPPRESSED' ? !validDate(row.suppressedAt) : row.suppressedAt != null)) add('EMAIL_OUTBOX_INVALID_STATE', row);
            if (row.status === 'PROCESSING' && row.leaseExpiresAt < now) add('EMAIL_OUTBOX_STALE_PROCESSING', row, true);
            if (row.status === 'RETRY' && row.nextAttemptAt < now) add('EMAIL_OUTBOX_OVERDUE_RETRY', row, true);
            if (row.status === 'DEAD') add('EMAIL_OUTBOX_DEAD', row, true);
            if (row.status === 'SENT' && !(row.sentAt instanceof Date)) add('EMAIL_OUTBOX_SENT_WITHOUT_SENT_AT', row);
            if (['to', 'email', 'recipientEmail', 'subject', 'text', 'html', 'payload', 'password', 'resetToken', 'resetUrl', 'secret', 'stack'].some(key => Object.hasOwn(row, key))) add('EMAIL_OUTBOX_FORBIDDEN_CONTENT', row);
            // Invalid historical IDs must never become query operators.
            const user = objectId(row.recipientUserId) ? await db.collection('users').findOne({ _id: row.recipientUserId }, { session, projection: { privacyStatus: 1 } }) : null;
            if (!user) add('EMAIL_OUTBOX_MISSING_RECIPIENT_USER', row);
            if (user?.privacyStatus === 'ANONYMIZED' && ['PENDING', 'RETRY', 'PROCESSING'].includes(row.status)) add('EMAIL_OUTBOX_PENDING_FOR_ANONYMIZED_USER', row, true);
        }
        write(JSON.stringify(summary)); for (const issue of issues) write(JSON.stringify(issue)); return { summary, issues };
    } finally { await session.endSession(); }
}
module.exports = { audit };
