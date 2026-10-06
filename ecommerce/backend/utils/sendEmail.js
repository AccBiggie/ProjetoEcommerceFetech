const nodeMailer = require("nodemailer");
const ErrorHander = require("./errorHander");

const sendEmail = async (options) => {
    if (!process.env.HOST || !process.env.USER || !process.env.PASSWORD) {
        throw new ErrorHander("Envio de e-mail indisponível. Configure HOST, PORTEMAIL, USER e PASSWORD no servidor.", 503);
    }
    const transporter = nodeMailer.createTransport ({
        host: process.env.HOST,
        port: process.env.PORTEMAIL,
        secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === "true" : Number(process.env.PORTEMAIL) === 465,
        auth: {
                user: process.env.USER,
                pass: process.env.PASSWORD,
        },
    });
    const mailOptions = {
        from: process.env.USER,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };
    await transporter.sendMail(mailOptions);
};
module.exports = sendEmail;
