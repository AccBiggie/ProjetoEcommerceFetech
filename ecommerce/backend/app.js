const express = require("express");
const app = express();
app.set("query parser", "extended");
app.set('trust proxy', require('./config/trustProxy').getTrustProxySetting());
// Validar somente a configuração necessária para emitir cookies válidos.
require('./config/authCookie').getAuthCookieOptions();
const fileUpload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const errorMiddleware = require("./middleware/erros");

app.use(require('./config/securityHeaders').apiSecurityHeaders());
// Gate antes de parsers, uploads, limiter e controllers; não consulta banco.
app.use('/api/v1', require('./middleware/csrf')());

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(express.urlencoded({extended: true, limit: "5mb"}));

app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 }, abortOnLimit: true }));
//Route  Imports
const product = require("./routes/productRoute");
const user = require("./routes/userRoutes");
const order = require("./routes/orderRoute");

app.use("/api/v1", product);
app.use("/api/v1", user);
app.use("/api/v1", order);
app.use("/api/v1", require("./routes/categoryRoute"));
app.use("/api/v1", require("./routes/addressRoute"));
//Middleware for Errors
app.use((req, res, next) => next(new (require("./utils/errorHander"))("Rota não encontrada.", 404)));
app.use(errorMiddleware);

module.exports = app;
