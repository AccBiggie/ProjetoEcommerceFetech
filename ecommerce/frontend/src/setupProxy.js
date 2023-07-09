const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    "/api/v1",
    createProxyMiddleware({
      target: "http://172.23.64.1:4000",
      changeOrigin: true,
    })
  );
};