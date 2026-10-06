const mongoose = require("mongoose");
const ErrorHander = require("../utils/errorHander");

module.exports = (req, res, next, id) => {
    if (!mongoose.isObjectIdOrHexString(id)) return next(new ErrorHander("Identificador inválido.", 400));
    next();
};
