const router = require('express').Router();
const { isAuthenticatedUser, authorizeRoles } = require('../middleware/auth');
const catchAsync = require('../middleware/catchAsyncErrors');
const ErrorHander = require('../utils/errorHander');
const Audit = require('../models/adminAuditEventModel');
const { actions, metadataFor } = require('../observability/auditContract');
const { uuid, objectId } = require('../observability/logger');
function queryFilter(query) {
    const allowed = ['page','limit','action','targetType','targetId','actorUserId','requestId','from','to'];
    const bad = () => { throw new ErrorHander('Filtros ou paginação de auditoria inválidos.', 400); };
    if (Object.keys(query).some(key => !allowed.includes(key) || typeof query[key] !== 'string')) bad();
    const number = (key, fallback, max) => { if (query[key] === undefined) return fallback; if (!/^[1-9]\d*$/.test(query[key]) || !Number.isSafeInteger(Number(query[key])) || Number(query[key]) > max) bad(); return Number(query[key]); };
    const limit = number('limit', 25, 100), page = number('page', 1, 1000000), filter = {};
    if (query.action !== undefined) { if (!Object.hasOwn(actions, query.action)) bad(); filter.action = query.action; }
    if (query.targetType !== undefined) { if (!['ORDER','USER','PRODUCT','CATEGORY'].includes(query.targetType)) bad(); filter.targetType = query.targetType; }
    for (const key of ['targetId','actorUserId']) if (query[key] !== undefined) { if (!objectId.test(query[key])) bad(); filter[key] = query[key]; }
    if (query.requestId !== undefined) { if (!uuid.test(query.requestId)) bad(); filter.requestId = query.requestId; }
    for (const [key, operator] of [['from','$gte'],['to','$lte']]) if (query[key] !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(query[key]) || !Number.isFinite(new Date(query[key]).getTime()) || new Date(query[key]).toISOString() !== query[key]) bad();
        (filter.createdAt ||= {})[operator] = new Date(query[key]);
    }
    if (filter.createdAt?.$gte > filter.createdAt?.$lte) bad();
    return { filter, page, limit };
}
router.get('/admin/audit-events', isAuthenticatedUser, authorizeRoles('admin'), catchAsync(async (req, res) => {
    const { filter, page, limit } = queryFilter(req.query);
    const total = await Audit.countDocuments(filter);
    const rows = await Audit.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const events = rows.map(row => ({ _id: row._id, eventVersion: row.eventVersion, createdAt: row.createdAt, requestId: row.requestId,
        actorUserId: row.actorUserId, actorRole: row.actorRole, action: row.action, targetType: row.targetType, targetId: row.targetId,
        metadata: metadataFor(row.action, row.metadata) }));
    res.json({ success: true, events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
module.exports = router;
module.exports.queryFilter = queryFilter;
