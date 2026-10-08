const router = require('express').Router();
const mongoose = require('mongoose');
const noStore = require('../utils/privateResponse');
const { transactionCapable } = require('../config/mongoTransactions');
router.get('/health/live', (_req, res) => { noStore(res); res.json({ status: 'ok' }); });
router.get('/health/ready', async (_req, res) => {
    noStore(res);
    try {
        if (mongoose.connection.readyState !== 1 || !transactionCapable(await mongoose.connection.db.admin().command({ hello: 1 }, { timeoutMS: 1000 }))) throw new Error();
        res.json({ status: 'ok' });
    } catch { res.status(503).json({ status: 'unavailable' }); }
});
module.exports = router;
