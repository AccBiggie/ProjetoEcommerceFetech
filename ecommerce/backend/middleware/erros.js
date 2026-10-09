//Backend Error Handling
const ErrorHander = require("../utils/errorHander");

module.exports = (err,req,res,next) => {
    const original = err;
    err.statusCode = err.statusCode || 500;
    err.message = err.message || "Internal Server Error ";
    //Wrong MongoDB Id error
    if(err.name === "CastError") {
        const message = `Resource not found. Invalid: ${err.path}`;
        err = new ErrorHander(message, 400);
    };
    //Mongoose duplicate key error
    if(err.code === 11000) {
        const message = 'Registro duplicado.';
        err = new ErrorHander(message,400);
    };
    //Wrong TWTToken error
    if(err.name === "JsonWebTokenError") {
        const message = `Json Web Token is invalid, try again`;
        err = new ErrorHander(message, 401);
    };
    //JWT Expire error
    if(err.name === "TokenExpiredError") {
        const message = `Web Token is Expired, try again`;
        err = new ErrorHander(message, 401);
    };
    if (err.name === "ValidationError") {
        err = new ErrorHander(Object.values(err.errors).map(error => error.message).join("; "), 400);
    }
    if (err.name === "VersionError") err = new ErrorHander("O pedido foi alterado. Atualize a página e tente novamente.", 409);
    const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500;
    require('../observability/logger')[status >= 500 ? 'error' : 'warn']('http.request.error', {
        route: require('./requestContext').safeRoute(req), method: req.method, status,
        errorCode: typeof original.code === 'string' && /^(PRIVACY_[A-Z_]{1,60}|USER_ANONYMIZED|ORDER_[A-Z_]{1,60}|CATEGORY_[A-Z_]{1,60}|AVATAR_[A-Z_]{1,60}|MEDIA_[A-Z_]{1,60}|PRODUCT_[A-Z_]{1,60})$/.test(original.code) ? original.code : Number.isSafeInteger(original.code) ? original.code : 'HTTP_' + status,
        errorName: original.name
    });
    if (res.headersSent) return next(err);
    res.status(status).json({
        success: false,
        ...(typeof err.code === "string" && /^(PRIVACY_[A-Z_]{1,60}|USER_ANONYMIZED|ORDER_[A-Z_]+|CATEGORY_[A-Z_]{1,60}|AVATAR_[A-Z_]{1,60}|MEDIA_[A-Z_]{1,60}|PRODUCT_[A-Z_]{1,60}|INVALID_QUERY|INVALID_PAGINATION|PAGINATION_RANGE_TOO_LARGE|REFERENCE_SET_TOO_LARGE|KEYWORD_TOO_LONG)$/.test(err.code) ? { code: err.code } : {}),
        message: status >= 500 ? 'Não foi possível concluir a operação.' : err.message,
    });
};
