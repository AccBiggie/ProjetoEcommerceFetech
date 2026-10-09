const catchAsyncErrors = require('./catchAsyncErrors');
const { createAuthRateLimiter } = require('../services/authRateLimiter');
const limiter = createAuthRateLimiter();

module.exports = action => catchAsyncErrors(async (req, res, next) => {
    const identity = { email: action === 'avatar' ? req.user.id : req.body?.email, ip: req.ip };
    const result = action === 'login' ? await limiter.beginLogin(identity) : await limiter.consume(action, identity);
    if (!result.allowed) {
        require('../observability/logger').warn('auth.rate_limited', { status: 429 });
        res.set('Retry-After', String(result.retryAfter));
        return res.status(429).json({ success: false, message: 'Muitas tentativas. Tente novamente mais tarde.' });
    }
    if (action === 'login') req.loginRateLimit = result;
    next();
});
