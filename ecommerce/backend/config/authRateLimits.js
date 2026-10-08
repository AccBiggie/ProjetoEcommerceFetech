const minute = 60 * 1000;
const rule = (scope, dimension, limit, windowMs = 15 * minute) => Object.freeze({ scope, dimension, limit, windowMs });

module.exports = Object.freeze({
    login: Object.freeze([
        rule('login:ip', 'ip', 50),
        rule('login:account', 'account', 20),
        rule('login:account-ip', 'account-ip', 5),
    ]),
    forgot: Object.freeze([rule('forgot:ip', 'ip', 10), rule('forgot:account', 'account', 5)]),
    reset: Object.freeze([rule('reset:ip', 'ip', 10)]),
    register: Object.freeze([rule('register:ip', 'ip', 10, 60 * minute)]),
});
