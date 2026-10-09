const assert = require('node:assert/strict');
const Category = require('../../backend/models/categoryModel');
const Product = require('../../backend/models/productModel');
const State = require('../../backend/models/categoryHierarchyStateModel');
const Audit = require('../../backend/models/adminAuditEventModel');
const { auditCategories } = require('../../backend/utils/categoryHierarchyAudit');
let sequence = 0;
async function start() {
    const env = await require('./observabilityHarness').start(), h = env.h;
    await Category.init(); await Product.init(); await State.init();
    const admin = await h.createUser('admin'), cookie = await h.login(admin);
    const request = (method, route, body, expected) => h.request(method, route, body, cookie, expected);
    const root = async (parent_id = null) => (await request('POST', '/admin/category', { name: 'Hierarchy ' + ++sequence, parent_id }, 201)).result.category;
    const update = (id, body, expected) => request('PUT', '/admin/category/' + id, body, expected);
    const remove = (id, expected) => request('DELETE', '/admin/category/' + id, null, expected);
    const createProduct = (id, expected) => request('POST', '/product/new', { ...require('../fixtures').productData(), category_id: id }, expected);
    const revision = async () => (await State.findById('category-hierarchy').lean())?.revision || 0;
    const healthy = async () => {
        const report = await auditCategories(Category.db, { write() {} }); assert.deepEqual(report.issues, []); return report;
    };
    const event = async reply => {
        const value = await Audit.findOne({ requestId: reply.response.headers.get('x-request-id') }).lean(); assert.ok(value); return value;
    };
    return { ...env, h, admin, cookie, request, root, update, remove, createProduct, revision, healthy, event };
}
module.exports = { start, Category, Product, State, Audit };
