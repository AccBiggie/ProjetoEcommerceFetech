const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const User = require("../models/userModel");
const sendToken = require("../utils/jwtToken");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
const { performance } = require('node:perf_hooks');
const { waitForMinimumDuration } = require('../utils/waitForMinimumDuration');
const { minimumResponseMs } = require('../config/passwordRecovery');
const uploadAvatar = require("../utils/avatar");
const { decodeSession, versionFilter, saveWithRevokedSessions, invalidSession } = require("../utils/authSession");
const adminSafety = require('../services/adminSafetyService').createAdminSafetyService();
//Register a User
exports.registerUser = catchAsyncErrors( async (req,res,next) => {
    const avatar = await uploadAvatar(req.body.avatar);
    const { name, email, password } = req.body;
    const user = await User.create ({
        name,
        email,
        password,
        avatar: avatar || { public_id: "default-avatar", url: "/Profile.png" },
    });
    sendToken(user, 201, res);
});
//Login User
exports.loginUser = catchAsyncErrors ( async (req,res,next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) throw new ErrorHander("Please enter Email and Password", 400);
        const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select("+password");
        if (!user || !await user.comparePassword(password)) {
            throw new ErrorHander("Invalid email or password", 401);
        }
        await req.loginRateLimit.finish(true);
        sendToken(user, 200, res);
    } catch (error) {
        await req.loginRateLimit.finish(false);
        throw error;
    }
});
//Logout User
exports.logout = catchAsyncErrors (async (req, res, next) => {
    const session = decodeSession(req.cookies.token);
    if (session) {
        await User.updateOne({ _id: session.id, ...versionFilter(session.tokenVersion) },
            { $inc: { tokenVersion: 1 } });
    }
    res.cookie("token", null, {
        expires: new Date( Date.now()),
        httpOnly: true,
    });

    res.status(200).json ({
        success: true,
        message: "Logged Out"
    });
});
//Forgot Password
exports.forgotPassword = catchAsyncErrors (async (req, res, next) => {
    const started = performance.now();
    const user = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase() });
    if (user) {
        //Get Reset Password Token
        const resetToken =  user.getResetPasswordToken();
        await user.save({ validateBeforeSave:false });

        const resetPasswordUrl = `${process.env.FRONTEND_URL}/password/reset/${resetToken}`;
        const message = `Your password reset token is :- \n\n ${ resetPasswordUrl } \n\nIf you have not requested this email then please ignore it`;

        try {
            await sendEmail ({
                email: user.email,
                subject: `Ecommerce Password Recovery`,
                message,
            });

        } catch {
            console.warn('password_recovery_email_failed');
            // Limpar somente o token deste envio, preservando uma recuperação mais recente.
            // Falhas estruturais de persistência continuam no middleware global.
            await User.updateOne({ _id: user._id, resetPasswordToken: user.resetPasswordToken },
                { $unset: { resetPasswordToken: '', resetPasswordExpire: '' } });
        }
    }
    await waitForMinimumDuration(started, minimumResponseMs);
    res.status(200).json({ success: true,
        message: 'Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha.' });
});
//RESET PASSWORD
exports.resetPassword = catchAsyncErrors (async (req, res, next) => {
    const resetPasswordToken = crypto.createHash("sha256").update(req.params.token).digest("hex"); //Create Token Hash
    const user = await User.findOne({
        resetPasswordToken, resetPasswordExpire : { $gt: Date.now() },
    });
    if(!user) {
        return next(new ErrorHander("Reset Password Token is invalid or hass been expired",400));
    };
    if(req.body.password !== req.body.confirmPassword ) {
        return next(new ErrorHander("Password does not match",400));
    }
    
    user.password = req.body.password;
    user.$where = { resetPasswordToken, resetPasswordExpire: { $gt: new Date() } };
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await saveWithRevokedSessions(user);

    sendToken(user, 200, res);
});
//GET USER DETAILS
exports.getUserDetails = catchAsyncErrors(async(req, res, next) => {
    const user = await User.findById(req.user.id);

    res.status(200).json({
        success: true,
        user,
    });
});
//UPDATE USER DETAILS
exports.updatePassword = catchAsyncErrors(async(req, res, next) => {
    const user = await User.findById(req.user.id).select("+password");
    if (!user || user.tokenVersion !== req.user.tokenVersion) return next(invalidSession());
    const isPasswordMatched = await user.comparePassword(req.body.oldPassword);

    if(!isPasswordMatched) {
        return next( new ErrorHander("Old password is incorret", 400));
    };
    if(req.body.newPassword !== req.body.confirmPassword) {
        return next( new ErrorHander("Password does not match", 400));
    }

    user.password = req.body.newPassword;
    await saveWithRevokedSessions(user);

    sendToken(user, 200, res);
});
//UPDATE USER PROFILE
exports.updateProfile = catchAsyncErrors(async(req, res, next) => {
    const newUserData = {
        name: req.body.name,
        email: req.body.email,
    }
    const avatar = await uploadAvatar(req.body.avatar);
    if (avatar) newUserData.avatar = avatar;
    const user = await User.findByIdAndUpdate(req.user.id, newUserData, {
        returnDocument: "after",
        runValidators: true,
    });
    res.status(200).json({
        success: true,
        user,
    });
});
//GET ALL USERS (Admin)
exports.getAllUser = catchAsyncErrors (async (req, res, next) => {
    const users = await User.find();

    res.status(200).json({
        success: true,
        users,
    });
});
//GET SINGLE USER (Admin)
exports.getSingleUser = catchAsyncErrors (async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if(!user) {
        return next(new ErrorHander("Usuário não encontrado.", 404));
    }

    res.status(200).json({
        success: true,
        user,
    });
});
//UPDATE USER ROLE --ADMIN
exports.updateUserRole = catchAsyncErrors(async(req, res, next) => {
    const user = await adminSafety.updateUser(req.user.id, req.params.id, req.body);
    res.status(200).json({
        success: true,
        user,
    });
});
//DELETE USER --ADMIN
exports.deleteUser = catchAsyncErrors(async(req, res, next) => {
    await adminSafety.deleteUser(req.user.id, req.params.id);

    res.status(200).json({
        success: true,
        message: "User Deleted Successfully",
    });
});
