const router = require('express').Router();
const { isAuthenticatedUser, authorizeRoles } = require('../middleware/auth');
const catchAsync = require('../middleware/catchAsyncErrors');
const ErrorHander = require('../utils/errorHander');
const Audit = require('../models/adminAuditEventModel');
const { actions, metadataFor } = require('../observability/auditContract');
const { uuid, objectId } = require('../observability/logger');
const paging = require('../utils/pagination');
function queryFilter(query) {
    const allowed = ['page','limit','action','targetType','targetId','actorUserId','requestId','from','to'];
    const bad = () => { throw new ErrorHander('Filtros ou paginação de auditoria inválidos.', 400); };
    if (Object.keys(query).some(key => !allowed.includes(key) || typeof query[key] !== 'string')) bad();
    const { limit, page } = paging.parsePagination(query), filter = {};
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
    paging.queryContract(req, ['page','limit','action','targetType','targetId','actorUserId','requestId','from','to']);
    const { filter } = queryFilter(req.query);
    const { items: rows, pagination } = await paging.collection(Audit, filter, paging.parsePagination(req.query), '_id eventVersion createdAt requestId actorUserId actorRole action targetType targetId metadata', { createdAt: -1, _id: -1 });
    const events = rows.map(row => ({ _id: row._id, eventVersion: row.eventVersion, createdAt: row.createdAt, requestId: row.requestId,
        actorUserId: row.actorUserId, actorRole: row.actorRole, action: row.action, targetType: row.targetType, targetId: row.targetId,
        metadata: metadataFor(row.action, row.metadata) }));
    res.json({ success: true, events, pagination });
}));
module.exports = router;
module.exports.queryFilter = queryFilter;
