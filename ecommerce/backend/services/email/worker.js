const crypto = require('node:crypto');
const validator = require('validator');
const Default = require('../../models/emailOutboxModel');
const { policy, providerFailure } = require('./contract');
const { privacyStatusOf } = require('../../utils/privacyContract');
function createWorker({ Model = Default, User = require('../../models/userModel'), Order = require('../../models/orderModel'),
    provider, config = require('../../config/runtimeConfig').getRuntimeConfig(), now = () => new Date(), render = require('./templates').render } = {}) {
    let stopping = false, timer, running, batchRunning = false;
    const log = (event, row, extra = {}) => require('../../observability/logger').info('email.outbox.' + event, { outboxId: String(row._id), eventType: row.eventType, requestId: row.requestId, attempt: row.attempts, ...extra });
    async function claim() {
        if (stopping) return null;
        const time = now();
        // A crash consumes an attempt too; expired final attempts become DEAD.
        await Model.updateOne({ status: 'PROCESSING', attempts: { $gte: policy.maxAttempts }, leaseExpiresAt: { $lte: time } },
            { $set: { status: 'DEAD', leaseToken: null, leaseExpiresAt: null, lastErrorCode: 'EMAIL_LEASE_EXHAUSTED' } });
        return Model.findOneAndUpdate({ attempts: { $lt: policy.maxAttempts }, $or: [
            { status: { $in: ['PENDING', 'RETRY'] }, nextAttemptAt: { $lte: time } },
            { status: 'PROCESSING', leaseExpiresAt: { $lte: time } },
        ] }, { $set: { status: 'PROCESSING', leaseToken: crypto.randomUUID(), leaseExpiresAt: new Date(time.getTime() + policy.leaseMs) }, $inc: { attempts: 1 } },
        { sort: { nextAttemptAt: 1, createdAt: 1, _id: 1 }, returnDocument: 'after' }).lean();
    }
    const owns = row => ({ _id: row._id, status: 'PROCESSING', leaseToken: row.leaseToken, leaseExpiresAt: { $gt: now() } });
    async function finish(row, status, fields = {}) {
        const result = await Model.updateOne(owns(row), { $set: { status, leaseToken: null, leaseExpiresAt: null, ...fields } });
        if (result.modifiedCount) log(status.toLowerCase(), row, { failureCode: fields.lastErrorCode });
        return result.modifiedCount === 1;
    }
    const suppress = (row, code) => finish(row, 'SUPPRESSED', { suppressedAt: now(), lastErrorCode: code });
    async function process(row) {
        if (!row || stopping || !await Model.exists(owns(row))) return false;
        // Native shape via lean: invalid legacy arrays must not be cast into a valid email/status.
        const user = await User.findById(row.recipientUserId).select('email privacyStatus').lean();
        if (!user) return suppress(row, 'EMAIL_RECIPIENT_USER_MISSING');
        if (privacyStatusOf(user) === 'ANONYMIZED') return suppress(row, 'EMAIL_RECIPIENT_ANONYMIZED');
        if (!['NORMAL', 'ANONYMIZATION_REQUESTED'].includes(privacyStatusOf(user))) return suppress(row, 'EMAIL_RECIPIENT_STATE_INVALID');
        if (typeof user.email !== 'string' || !validator.isEmail(user.email) || /@privacy\.invalid$/i.test(user.email)) return suppress(row, 'EMAIL_RECIPIENT_INVALID');
        let order;
        if (row.eventType === 'ORDER_CREATED') {
            order = await Order.findById(row.entityId).select('_id user totalPriceCents totalPrice').lean();
            if (!order) return suppress(row, 'EMAIL_TARGET_MISSING');
            if (String(order.user) !== String(row.recipientUserId)) return suppress(row, 'EMAIL_TARGET_INVALID');
        }
        let message;
        try { message = render(row, { origin: config.frontend.origin, order }); }
        catch { return finish(row, 'DEAD', { lastErrorCode: 'EMAIL_TEMPLATE_ERROR' }); }
        // Recheck immediately before I/O; there is no atomic Mongo/SMTP commit.
        const current = await User.findById(row.recipientUserId).select('email privacyStatus').lean();
        if (!current) return suppress(row, 'EMAIL_RECIPIENT_USER_MISSING');
        if (privacyStatusOf(current) === 'ANONYMIZED') return suppress(row, 'EMAIL_RECIPIENT_ANONYMIZED');
        if (current.email !== user.email || !['NORMAL', 'ANONYMIZATION_REQUESTED'].includes(privacyStatusOf(current))) return row.attempts >= policy.maxAttempts
            ? finish(row, 'DEAD', { lastErrorCode: 'EMAIL_RECIPIENT_STATE_INVALID' })
            : finish(row, 'RETRY', { nextAttemptAt: new Date(now().getTime() + policy.delays[row.attempts - 1]), lastErrorCode: 'EMAIL_RECIPIENT_STATE_INVALID' });
        if (stopping || !await Model.exists(owns(row))) return false;
        let response;
        try { response = await (provider || require('./emailProvider').getProvider(config)).send({ ...message, to: current.email, headers: { 'X-Fetech-Event-Id': String(row._id) } }); }
        catch (error) {
            const failure = providerFailure(error), dead = failure.permanent || row.attempts >= policy.maxAttempts;
            return finish(row, dead ? 'DEAD' : 'RETRY', { lastErrorCode: failure.code, ...(dead ? {} : { nextAttemptAt: new Date(now().getTime() + policy.delays[row.attempts - 1]) }) });
        }
        // DB failure here is ambiguous: keep lease for recovery, never claim SMTP exactly-once.
        const id = typeof response?.messageId === 'string' && response.messageId.length <= 512 ? 'sha256:' + crypto.createHash('sha256').update(response.messageId).digest('hex') : null;
        return finish(row, 'SENT', { sentAt: now(), lastErrorCode: null, providerMessageId: id });
    }
    async function once() {
        if (batchRunning || stopping) return 0;
        batchRunning = true;
        try {
        let processed = 0;
        for (; processed < policy.batch && !stopping; processed++) { const row = await claim(); if (!row) break; await process(row); }
        return processed;
        } finally { batchRunning = false; }
    }
    function start() {
        if (running || timer || stopping) return;
        const tick = () => {
            running = once().catch(() => require('../../observability/logger').warn('email.outbox.worker_failed')).finally(() => {
                running = null; if (!stopping) { timer = setTimeout(() => { timer = null; tick(); }, policy.pollMs); timer.unref?.(); }
            });
        };
        tick();
    }
    async function stop() {
        stopping = true; clearTimeout(timer); timer = null;
        if (running) { let deadline; await Promise.race([running, new Promise(resolve => { deadline = setTimeout(resolve, policy.shutdownMs); })]); clearTimeout(deadline); }
        provider?.close?.();
    }
    return { claim, process, once, start, stop };
}
function startWorker(config, options = {}) {
    if (config.environment === 'test' || config.profile !== 'server' || !config.smtp?.enabled) return null;
    const worker = createWorker({ config, provider: require('./emailProvider').getProvider(config), ...options }); worker.start(); return worker;
}
module.exports = { createWorker, startWorker };
