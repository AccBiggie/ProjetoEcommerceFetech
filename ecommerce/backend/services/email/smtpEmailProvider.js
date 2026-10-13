const nodemailer = require('nodemailer');
function createSmtpEmailProvider(smtp) {
    let transport;
    return {
        async send(message) {
            if (!smtp?.enabled) { const error = new Error('Email provider unavailable'); error.code = 'EMAIL_PROVIDER_UNAVAILABLE'; throw error; }
            transport ||= nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
            return transport.sendMail({ ...message, from: smtp.user });
        },
        close() { transport?.close?.(); },
    };
}
module.exports = { createSmtpEmailProvider };
