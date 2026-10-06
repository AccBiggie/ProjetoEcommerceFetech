const mongoose = require("mongoose");

module.exports = async () => {
    if (!process.env.DB_URI) {
        throw new Error("Configure DB_URI em backend/config/config.env");
    }
    const connection = await mongoose.connect(process.env.DB_URI, {
        serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB conectado: ${connection.connection.host}`);
};
