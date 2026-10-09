const { current } = require('./context');
const { redact } = require('./redact');
const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const events = new Set(['http.request.completed','http.request.aborted','http.request.error','auth.login.failed','auth.rate_limited','csrf.rejected','password.recovery.email.failed','admin.action.completed','admin.action.failed','order.transaction.failed','order.idempotency.replayed','app.started','app.shutdown.requested','app.shutdown.completed','app.startup.failed','app.uncaught_exception','app.unhandled_rejection','database.connected','product.review.data_inconsistent','user.avatar.upload_failed','user.avatar.updated','media.cleanup.pending','media.cleanup.completed','media.cleanup.blocked']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const objectId = /^[a-f0-9]{24}$/i;
function fieldsForLog(input) {
    const safe = {}, fields = redact(input);
    for (const key of ['status','durationMs','port']) if (Number.isFinite(fields[key]) && fields[key] >= 0) safe[key] = fields[key];
    for (const key of ['requestId','userId','orderId','targetId','intentId','cleanupTaskId']) if ((key === 'requestId' ? uuid : objectId).test(fields[key])) safe[key] = String(fields[key]);
    for (const [key, allowed] of Object.entries({ method: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'], role: ['admin','user'], environment: ['development','test','production'], reason: ['origin_mismatch','invalid_credentials','policy_rejected'], errorName: ['Error','ErrorHander','MongoServerError','MongoNetworkError','ValidationError','CastError','VersionError','ConfigurationError','TransactionTopologyError','JsonWebTokenError','TokenExpiredError'] })) if (allowed.includes(fields[key])) safe[key] = fields[key];
    if (fields.errorName !== undefined && safe.errorName === undefined) safe.errorName = 'Error';
    if (typeof fields.route === 'string' && (fields.route === 'UNMATCHED' || /^\/api\/v1\/[A-Za-z0-9_/:.-]{1,160}$/.test(fields.route))) safe.route = fields.route;
    if (typeof fields.errorCode === 'number' && Number.isSafeInteger(fields.errorCode)) safe.errorCode = fields.errorCode;
    if (typeof fields.errorCode === 'string' && /^(ORDER_[A-Z_]{1,60}|CATEGORY_[A-Z_]{1,60}|AVATAR_[A-Z_]{1,60}|MEDIA_[A-Z_]{1,60}|PRODUCT_REVIEW_DATA_INCONSISTENT|HTTP_[45]\d\d|INTERNAL_ERROR)$/.test(fields.errorCode)) safe.errorCode = fields.errorCode;
    if (typeof fields.failureCode === 'string' && /^(MEDIA_[A-Z_]{1,60}|STILL_REFERENCED|LEGACY_UNMANAGED_AVATAR)$/.test(fields.failureCode)) safe.failureCode = fields.failureCode;
    if (fields.transactionCapable === true) safe.transactionCapable = true;
    if (Object.hasOwn(require('./auditContract').actions, fields.action)) safe.action = fields.action;
    if (['ORDER','USER','PRODUCT','CATEGORY'].includes(fields.targetType)) safe.targetType = fields.targetType;
    if (Array.isArray(fields.invalidVariables)) safe.invalidVariables = fields.invalidVariables.filter(name => ['NODE_ENV','PORT','DB_URI','JWT_SECRET','JWT_EXPIRE','COOKIE_EXPIRE','FRONTEND_URL','TRUST_PROXY_HOPS','AUTH_FORGOT_MIN_RESPONSE_MS','HOST','PORTEMAIL','EMAIL_SECURE','USER','PASSWORD','CLOUDINARY_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','LOG_LEVEL','PROFILE'].includes(name));
    return safe;
}
function createLogger({ level = () => require('../config/runtimeConfig').getRuntimeConfig().logging.level,
    stdout = line => process.stdout.write(line), stderr = line => process.stderr.write(line) } = {}) {
    const logger = {};
    for (const name of Object.keys(levels)) logger[name] = (event, fields = {}) => {
        if (levels[name] < levels[typeof level === 'function' ? level() : level]) return;
        const context = current();
        const data = { timestamp: new Date().toISOString(), level: name, event: events.has(event) ? event : 'observability.invalid_event',
            ...fieldsForLog(fields), ...fieldsForLog(context || {}) };
        // Free-form messages, stacks, bodies and unknown fields are never serialized.
        (levels[name] >= levels.warn ? stderr : stdout)(JSON.stringify(data) + '\n');
    };
    return logger;
}
module.exports = { ...createLogger(), createLogger, uuid, objectId };
