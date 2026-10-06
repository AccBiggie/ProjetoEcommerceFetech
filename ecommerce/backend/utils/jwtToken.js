//Create Token and Saving in cookie
const sendToken = (user, statusCode, res) => {
    const token = user.getJWTToken();
    //Options for cookie
    const options = {
        expires: new Date(
            Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        sameSite: "lax",
    };
    const publicUser = user.toObject();
    delete publicUser.password;
    delete publicUser.resetPasswordToken;
    delete publicUser.resetPasswordExpire;
    res.status(statusCode).cookie('token', token, options,).json ({
        success:true,
        user: publicUser,
        token,
    });
};
module.exports = sendToken;
