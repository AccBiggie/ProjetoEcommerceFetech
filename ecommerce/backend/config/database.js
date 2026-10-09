const mongoose = require('mongoose');
module.exports = async (config = require('./runtimeConfig').getRuntimeConfig()) => {
    await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false });
    require('../observability/logger').info('database.connected');
};
