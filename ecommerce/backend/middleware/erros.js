//Backend Error Handling
const ErrorHander = require("../utils/errorHander");

module.exports = (err,req,res,next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || "Internal Server Error ";
    //Wrong MongoDB Id error
    if(err.name === "CastError") {
        const message = `Resource not found. Invalid: ${err.path}`;
        err = new ErrorHander(message, 400);
    };
    //Mongoose duplicate key error
    if(err.code === 11000) {
        const message = `Duplicate ${Object.keys(err.keyValue)} Entered`;
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
    res.status(err.statusCode).json({
        success: false,
        message: err.message,
    });
};
