const path = require("path");
const dotenv = require("dotenv");
dotenv.config({path: path.join(__dirname, "config", "config.env")});
const app = require("./app");
const cloudinary = require("cloudinary")
const connectDataBase = require("./config/database.js");
//Handling Uncaught Exception
process.on("uncaughtException", (err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting down to server duo to Uncaught Exceptions Rejection`);
    process.exit(1);    
})
//config

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

let server;
connectDataBase().then(() => {
    const port = process.env.PORT || 4000;
    server = app.listen(port, "127.0.0.1", () => {
        console.log(`Server is Working on http://localhost:${port}`);
    });
});
//Unhandled Promise Rejection
process.on("unhandledRejection", (err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting down to server duo to Unhandled Promise Rejection`);
    
    if (!server) process.exit(1);
    server.close(() => {
        process.exit(1);
    });
});
