const Default = require('../../models/emailOutboxModel');
const { events } = require('./contract');
const { txOptions } = require('../privacySensitiveWrite');
const modelFor = connection => connection.models.EmailOutbox || connection.model('EmailOutbox', Default.schema);
async function enqueue({ eventType, recipientUserId, entityId, version = 'v1', requestId = null }, session, connection = Default.db) {
    if (!session?.inTransaction() || !events.includes(eventType) || !(version === 'v1' || Number.isSafeInteger(version) && version >= 0)) throw new Error('Transactional email requires domain transaction');
    const entityType = ['ORDER_CREATED', 'ORDER_CANCELLED'].includes(eventType) ? 'ORDER' : eventType === 'PRIVACY_REQUEST_CREATED' ? 'PRIVACY_REQUEST' : 'USER';
    const document = new (modelFor(connection))({ eventType, recipientUserId, entityId, entityType, dedupeKey: `${eventType}:${entityId}:${version}`, requestId });
    await document.validate();
    const result = await modelFor(connection).updateOne({ dedupeKey: document.dedupeKey }, { $setOnInsert: document.toObject() }, { upsert: true, session, timestamps: false });
    if (result.upsertedCount) { session.emailEnqueued ||= new Map(); session.emailEnqueued.set(document.dedupeKey, { outboxId: String(document._id), eventType, requestId }); }
    return document.dedupeKey;
}
async function domainTransaction(connection, work) {
    await modelFor(connection).init(); const session = await connection.startSession();
    try {
        for (let attempt = 0; ; attempt++) {
            try { const result = await session.withTransaction(() => { session.emailEnqueued = new Map(); return work(session); }, txOptions); logCommitted(session); return result; }
            catch (error) { if (error.code !== 11000 || !error.keyPattern?.dedupeKey || attempt >= 2) throw error; }
        }
    } finally { await session.endSession(); }
}
function logCommitted(session) { for (const fields of session.emailEnqueued?.values() || []) require('../../observability/logger').info('email.outbox.enqueued', fields); session.emailEnqueued?.clear(); }
module.exports = { enqueue, modelFor, domainTransaction, logCommitted };
