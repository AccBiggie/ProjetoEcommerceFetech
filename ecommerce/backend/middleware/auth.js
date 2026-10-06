const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("./catchAsyncErrors");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

exports.isAuthenticatedUser = catchAsyncErrors (async (req, res, next) => {
    const { token } = req.cookies;
    if(!token) {
        return next(new ErrorHander ("Please login to access this resource", 401));
    }
    const decodedData = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decodedData.id);  
    if (!req.user) return next(new ErrorHander("Sua conta não existe mais. Entre novamente.", 401));
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
