const nodeMailer = require("nodemailer");
const ErrorHander = require("./errorHander");

const sendEmail = async (options) => {
    const smtp = require('../config/runtimeConfig').getRuntimeConfig().smtp;
    if (!smtp.enabled) {
        throw new ErrorHander("Envio de e-mail indisponível. Configure HOST, PORTEMAIL, USER e PASSWORD no servidor.", 503);
    }
    const transporter = nodeMailer.createTransport ({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
                user: smtp.user,
                pass: smtp.password,
        },
    });
    const mailOptions = {
        from: smtp.user,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };
    await transporter.sendMail(mailOptions);
};
module.exports = sendEmail;
