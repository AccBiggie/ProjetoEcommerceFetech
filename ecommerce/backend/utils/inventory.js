const ErrorHander = require('./errorHander');
const validStock = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function validateStock(value) {
    if (!validStock(value)) throw new ErrorHander('Estoque deve ser um número inteiro seguro não negativo.', 400);
    return value;
}
function inventoryError(code, message, status = 409) {
    const error = new ErrorHander(message, status); error.code = code; return error;
}
const insufficientStock = () => inventoryError('ORDER_INSUFFICIENT_STOCK', 'Estoque insuficiente para um ou mais produtos.');
module.exports = { validStock, validateStock, inventoryError, insufficientStock };
