// Aplicar apenas a respostas privadas ou que emitem/removem sessão.
module.exports = function setNoStore(res) {
    res.setHeader('Cache-Control', 'no-store');
};
