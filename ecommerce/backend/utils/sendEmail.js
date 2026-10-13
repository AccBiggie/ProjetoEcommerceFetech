const sendEmail = async (options) => {
    const provider = require('../services/email/emailProvider').getProvider();
    try { return await provider.send({ to: options.email, subject: options.subject, text: options.message }); }
    finally { provider.close?.(); }
};
module.exports = sendEmail;
