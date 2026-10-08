//Create Token and Saving in cookie
const { setAuthCookie } = require('../config/authCookie');
const setNoStore = require('./privateResponse');
const sendToken = (user, statusCode, res) => {
    setNoStore(res);
    const token = user.getJWTToken();
    const publicUser = user.toObject();
    delete publicUser.password;
    delete publicUser.resetPasswordToken;
    delete publicUser.resetPasswordExpire;
    res.status(statusCode);
    setAuthCookie(res, token).json ({
        success:true,
        user: publicUser,
    });
};
module.exports = sendToken;
