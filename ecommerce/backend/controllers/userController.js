const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const User = require("../models/userModel");
const sendToken = require("../utils/jwtToken");
const { clearAuthCookie } = require('../config/authCookie');
const setNoStore = require('../utils/privateResponse');
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
const { performance } = require('node:perf_hooks');
const { waitForMinimumDuration } = require('../utils/waitForMinimumDuration');
const recoveryConfig = require('../config/passwordRecovery');
const { rejectMediaFields } = require('../utils/mediaContract');
const { decodeSession, versionFilter, saveWithRevokedSessions, invalidSession } = require("../utils/authSession");
const adminSafety = require('../services/adminSafetyService').createAdminSafetyService();
const { activeFilter, isActive, adminUser } = require('../utils/userLifecycle');
//Register a User
exports.registerUser = catchAsyncErrors( async (req,res,next) => {
    if (!req.is('application/json')) throw require('../utils/mediaContract').error('AVATAR_MULTIPART_REQUIRED', 400, 'Envie os dados de cadastro como JSON e a foto após entrar na conta.');
    rejectMediaFields(req.body);
    const { name, email, password } = req.body;
    const user = await require('../services/email/enqueue').domainTransaction(User.db, async session => {
        const [created] = await User.create ([{
        name,
        email,
        password,
        avatar: { public_id: "default-avatar", url: "/Profile.png" },
        }], { session });
        await require('../services/email/enqueue').enqueue({ eventType: 'ACCOUNT_REGISTERED', recipientUserId: created._id, entityId: created._id, requestId: req.requestId }, session, User.db);
        return created;
    });
    sendToken(user, 201, res);
});
//Login User
exports.loginUser = catchAsyncErrors ( async (req,res,next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) throw new ErrorHander("Please enter Email and Password", 400);
        const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select("+password");
        if (!user || !await user.comparePassword(password) || !isActive(user) ||
            !await User.exists({ $and: [{ _id: user._id }, activeFilter(), versionFilter(user.tokenVersion)] })) {
            require('../observability/logger').warn('auth.login.failed', { status: 401, reason: 'invalid_credentials' });
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
    setNoStore(res);
    const session = decodeSession(req.cookies.token);
    if (session) {
        await User.updateOne({ _id: session.id, ...versionFilter(session.tokenVersion) },
            { $inc: { tokenVersion: 1 } });
    }
    clearAuthCookie(res);

    res.status(200).json ({
        success: true,
        message: "Logged Out"
    });
});
//Forgot Password
exports.forgotPassword = catchAsyncErrors (async (req, res, next) => {
    const started = performance.now();
    const user = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase(), ...activeFilter() });
    if (user) {
        //Get Reset Password Token
        const resetToken =  user.getResetPasswordToken();
        user.$where = { $and: [activeFilter(), versionFilter(user.tokenVersion)] };
        let saved = true;
        try { await user.save({ validateBeforeSave:false }); }
        catch (error) { if (error.name !== 'DocumentNotFoundError') throw error; saved = false; }

        const resetPasswordUrl = `${require('../config/runtimeConfig').getRuntimeConfig().frontend.origin}/password/reset/${resetToken}`;
        const message = `Your password reset token is :- \n\n ${ resetPasswordUrl } \n\nIf you have not requested this email then please ignore it`;

        try {
            if (saved && await User.exists({ _id: user._id, resetPasswordToken: user.resetPasswordToken, ...activeFilter() })) await sendEmail ({
                email: user.email,
                subject: `Ecommerce Password Recovery`,
                message,
            });

        } catch {
            require('../observability/logger').warn('password.recovery.email.failed');
            // Limpar somente o token deste envio, preservando uma recuperação mais recente.
            // Falhas estruturais de persistência continuam no middleware global.
            await User.updateOne({ _id: user._id, resetPasswordToken: user.resetPasswordToken },
                { $unset: { resetPasswordToken: '', resetPasswordExpire: '' } });
        }
    }
    await waitForMinimumDuration(started, recoveryConfig.minimumResponseMs);
    res.status(200).json({ success: true,
        message: 'Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinição de senha.' });
});
//RESET PASSWORD
exports.resetPassword = catchAsyncErrors (async (req, res, next) => {
    const resetPasswordToken = crypto.createHash("sha256").update(req.params.token).digest("hex"); //Create Token Hash
    const user = await User.findOne({
        resetPasswordToken, resetPasswordExpire : { $gt: Date.now() },
        ...activeFilter(),
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
    if (!req.is('application/json')) throw require('../utils/mediaContract').error('AVATAR_MULTIPART_REQUIRED', 400, 'Envie os dados do perfil como JSON.');
    rejectMediaFields(req.body);
    const newUserData = Object.fromEntries(['name', 'email'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    const user = await User.findOneAndUpdate({ $and: [{ _id: req.user.id }, activeFilter(), versionFilter(req.user.tokenVersion)] }, { $set: newUserData }, {
        returnDocument: "after",
        runValidators: true,
    });
    if (!user) throw invalidSession();
    res.status(200).json({
        success: true,
        user,
    });
});
exports.updateAvatar = catchAsyncErrors(async (req, res) => {
    const bytes = await require('../utils/avatarContent').validateAvatarContent(req.avatarFile.bytes, req.avatarFile.mime);
    const user = await require('../services/avatarMediaService').createAvatarMediaService().replace({ actor: req.user, bytes });
    res.status(200).json({ success: true, user });
});
//GET ALL USERS (Admin)
exports.getAllUser = catchAsyncErrors (async (req, res, next) => {
    const paging = require('../utils/pagination');
    paging.queryContract(req, ['page','limit','sort','status']);
    const pagination = paging.parsePagination(req.query);
    const status = req.query.status === undefined ? 'active' : req.query.status;
    if (typeof status !== 'string' || !['active', 'deactivated', 'all'].includes(status)) throw new ErrorHander('Filtro de status inválido.', 400);
    const result = await paging.collection(User, status === 'active' ? activeFilter() : status === 'deactivated' ? { accountStatus: 'DEACTIVATED' } : {}, pagination,
        '_id name email role avatar createdAt accountStatus privacyStatus deactivatedAt deactivatedBy', paging.sort(req.query));

    res.status(200).json({
        success: true,
        users: result.items.map(adminUser), pagination: result.pagination,
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
        user: adminUser(user),
    });
});
//UPDATE USER ROLE --ADMIN
exports.updateUserRole = catchAsyncErrors(async(req, res, next) => {
    const user = await adminSafety.updateUser(req.user.id, req.params.id, req.body, req);
    res.status(200).json({
        success: true,
        user: adminUser(user),
    });
});
//DELETE USER --ADMIN
exports.deleteUser = catchAsyncErrors(async(req, res, next) => {
    res.set('Allow', 'PATCH').status(405).json({ success: false, message: 'Usuários não podem ser excluídos fisicamente.' });
});
exports.deactivateUser = catchAsyncErrors(async (req, res) => {
    const user = await adminSafety.deactivateUser(req.user.id, req.params.id, req);
    res.status(200).json({ success: true, user: adminUser(user) });
});
exports.reactivateUser = catchAsyncErrors(async (req, res) => {
    const user = await adminSafety.reactivateUser(req.user.id, req.params.id, req);
    res.status(200).json({ success: true, user: adminUser(user) });
});
