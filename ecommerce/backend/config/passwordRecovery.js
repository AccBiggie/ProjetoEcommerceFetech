// Configuração opcional, com fallback seguro para entradas inválidas.
const configured = Number(process.env.AUTH_FORGOT_MIN_RESPONSE_MS ?? 300);
module.exports = Object.freeze({ minimumResponseMs:
    Number.isFinite(configured) && configured >= 0 && configured <= 5000 ? configured : 300 });
