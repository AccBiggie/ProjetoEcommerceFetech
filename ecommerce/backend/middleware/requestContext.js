const { randomUUID } = require('node:crypto');
const { storage } = require('../observability/context');
const logger = require('../observability/logger');
function safeRoute(req) {
    const template = req.route?.path;
    return typeof template === 'string' ? (template.startsWith('/api/v1/') ? template : '/api/v1' + template) : 'UNMATCHED';
}
function requestContext(req, res, next) {
    const context = { requestId: randomUUID() }, started = process.hrtime.bigint();
    req.requestId = context.requestId;
    res.setHeader('X-Request-Id', context.requestId);
    let logged = false;
    const completed = aborted => {
        if (logged) return; logged = true;
        storage.run(context, () => {
            const route = safeRoute(req), level = route.startsWith('/api/v1/health/') ? 'debug' : 'info';
            logger[level](aborted ? 'http.request.aborted' : 'http.request.completed', {
                method: req.method, route, status: aborted ? 499 : res.statusCode,
                durationMs: Number(process.hrtime.bigint() - started) / 1e6
            });
        });
    };
    res.once('finish', () => completed(false));
    res.once('close', () => completed(!res.writableFinished));
    storage.run(context, next);
}
module.exports = { requestContext, safeRoute };
