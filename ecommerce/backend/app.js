const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
const errorMiddleware = require("./middleware/erros");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true, limit: "5mb"}));
app.use(fileUpload());
//Route  Imports
const product = require("./routes/productRoute");
const user = require("./routes/userRoutes");
const order = require("./routes/orderRoute");

app.use("/api/v1", product);
app.use("/api/v1", user);
app.use("/api/v1", order);
//Middleware for Errors
app.use((req, res, next) => next(new (require("./utils/errorHander"))("Rota não encontrada.", 404)));
app.use(errorMiddleware);

module.exports = app;
