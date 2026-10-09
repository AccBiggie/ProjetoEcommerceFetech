const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("./catchAsyncErrors");
const User = require("../models/userModel");
const { decodeSession, invalidSession } = require("../utils/authSession");
const setNoStore = require('../utils/privateResponse');

exports.isAuthenticatedUser = catchAsyncErrors (async (req, res, next) => {
    setNoStore(res);
    const { token } = req.cookies;
    const decodedData = decodeSession(token);
    if (!decodedData) return next(invalidSession());
    req.user = await User.findOne({ $and: [{ _id: decodedData.id }, require('../utils/userLifecycle').activeFilter()] });
    if (!require('../utils/userLifecycle').isActive(req.user) || decodedData.tokenVersion !== req.user.tokenVersion) return next(invalidSession());
    const context = require('../observability/context').current();
    if (context) { context.userId = String(req.user._id); context.role = req.user.role; }
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
