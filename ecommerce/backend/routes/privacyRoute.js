const router = require('express').Router();
const { isAuthenticatedUser, authorizeRoles } = require('../middleware/auth');
const catchAsync = require('../middleware/catchAsyncErrors');
const paging = require('../utils/pagination');
const { emptyBody } = require('../utils/privacyContract');
const service = require('../services/privacyService');
const Request = require('../models/privacyRequestModel');
const User = require('../models/userModel');
router.param('id', require('../middleware/validateId'));
router.use(['/me/privacy', '/admin/privacy'], isAuthenticatedUser);
router.post('/me/privacy/anonymization-request', require('../middleware/authRateLimit')('privacy'), catchAsync(async (req, res) => {
    paging.queryContract(req, []); emptyBody(req); const result = await service.requestAnonymization(req); res.status(result.created ? 201 : 200).json({ success: true, request: result.request });
}));
router.get('/me/privacy/anonymization-request', catchAsync(async (req, res) => { paging.queryContract(req, []); res.json({ success: true, request: await service.latest(req.user._id) }); }));
router.patch('/me/privacy/anonymization-request/cancel', require('../middleware/authRateLimit')('privacy'), catchAsync(async (req, res) => { paging.queryContract(req, []); emptyBody(req); res.json({ success: true, request: await service.cancel(req) }); }));
router.get('/me/privacy/data-overview', catchAsync(async (req, res) => { paging.queryContract(req, []); res.json({ success: true, overview: await service.overview(req.user._id) }); }));
router.get('/admin/privacy/requests', authorizeRoles('admin'), catchAsync(async (req, res) => {
    paging.queryContract(req, ['page', 'limit', 'status']); const status = req.query.status || 'REQUESTED';
    if (!['REQUESTED', 'COMPLETED', 'CANCELLED'].includes(status)) paging.bad();
    const result = await paging.collection(Request, { status }, paging.parsePagination(req.query), '_id user type status requestedAt completedAt cancelledAt createdAt', { createdAt: -1, _id: -1 });
    // Bounded lookup: at most 100 users, only state/IDs, never profile PII.
    const users = await User.find({ _id: { $in: result.items.map(item => item.user) } }).select('_id role accountStatus privacyStatus').lean();
    const byId = new Map(users.map(user => [String(user._id), user]));
    res.json({ success: true, requests: result.items.map(item => { const user = byId.get(String(item.user)); return { ...item, accountStatus: user?.accountStatus || 'ACTIVE', privacyStatus: user?.privacyStatus || 'NORMAL', eligible: item.status === 'REQUESTED' && user?.accountStatus === 'DEACTIVATED' && user.role !== 'admin' && user.privacyStatus !== 'ANONYMIZED' }; }), pagination: result.pagination });
}));
router.post('/admin/privacy/requests/:id/anonymize', authorizeRoles('admin'), catchAsync(async (req, res) => { paging.queryContract(req, []); emptyBody(req, ['confirmation']); res.json({ success: true, ...await service.anonymize(req) }); }));
module.exports = router;
