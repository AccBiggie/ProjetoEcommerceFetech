class TransactionTopologyError extends Error {
    constructor() { super('A API comercial exige MongoDB com suporte a transações.'); this.name = 'TransactionTopologyError'; }
}
function transactionCapable(hello) {
    return Number.isFinite(hello?.logicalSessionTimeoutMinutes) &&
        ((typeof hello.setName === 'string' && hello.maxWireVersion >= 7) || (hello.msg === 'isdbgrid' && hello.maxWireVersion >= 8));
}
async function requireTransactions(connection = require('mongoose').connection) {
    try { if (!transactionCapable(await connection.db.admin().command({ hello: 1 }))) throw new TransactionTopologyError(); }
    catch { throw new TransactionTopologyError(); }
}
module.exports = { requireTransactions, transactionCapable, TransactionTopologyError };
