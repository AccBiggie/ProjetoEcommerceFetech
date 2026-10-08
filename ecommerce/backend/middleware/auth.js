const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("./catchAsyncErrors");
const User = require("../models/userModel");
const { decodeSession, invalidSession } = require("../utils/authSession");

exports.isAuthenticatedUser = catchAsyncErrors (async (req, res, next) => {
    const { token } = req.cookies;
    const decodedData = decodeSession(token);
    if (!decodedData) return next(invalidSession());
    req.user = await User.findById(decodedData.id);  
    if (!req.user || decodedData.tokenVersion !== req.user.tokenVersion) return next(invalidSession());
    next();
});
exports.authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if(!roles.includes (req.user.role)) {
            return next (new ErrorHander(`Role: ${req.user.role} is not allowed to access this resource`, 403)); 
        };
        next();
    };
};
