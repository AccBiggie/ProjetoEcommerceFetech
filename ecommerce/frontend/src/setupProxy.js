const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    "/api/v1",
    createProxyMiddleware({
      target: process.env.API_PROXY_TARGET || "http://127.0.0.1:4000",
      changeOrigin: true,
    })
  );
};
