// No network or transport initialization on import. Tests inject a provider.
function getProvider(config = require('../../config/runtimeConfig').getRuntimeConfig()) {
    return require('./smtpEmailProvider').createSmtpEmailProvider(config.smtp);
}
module.exports = { getProvider };
