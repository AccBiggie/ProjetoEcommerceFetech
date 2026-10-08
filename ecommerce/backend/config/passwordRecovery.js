module.exports = Object.freeze({ get minimumResponseMs() { return require('./runtimeConfig').getRuntimeConfig().auth.minimumResponseMs; } });
