const mongoose = require('mongoose');
const State = require('../models/categoryHierarchyStateModel');
const Category = require('../models/categoryModel');
const Product = require('../models/productModel');
const ErrorHander = require('../utils/errorHander');
const { runAuditedAdminMutation } = require('./adminAuditService');
const singleton = 'category-hierarchy';
const transactionOptions = { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000, timeoutMS: 30000 };
const failure = (code, message, status = 409) => Object.assign(new ErrorHander(message, status), { code });
const isId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) || value instanceof mongoose.Types.ObjectId;
function parentId(value) {
    if (value == null) return null;
    if (!isId(value)) throw failure('CATEGORY_INVALID_ID', 'Identificador da categoria pai inválido.', 400);
    return new mongoose.Types.ObjectId(value);
}
async function prepare(connection = State.db) {
    const model = connection.models.CategoryHierarchyState || connection.model('CategoryHierarchyState', State.schema);
    await model.init();
    // Bootstrap outside the transaction avoids a non-retryable duplicate-key upsert
    // on the first concurrent requests. No domain mutation happens here.
    try { await model.updateOne({ _id: singleton }, { $setOnInsert: { revision: 0, updatedAt: new Date() } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000 || error.keyValue?._id !== singleton) throw error; }
}
async function coordinate(session, connection = State.db) {
    if (!session?.inTransaction()) throw new Error('Category coordination requires a transaction');
    const result = await connection.db.collection('categoryhierarchystates')
        .updateOne({ _id: singleton }, { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { session });
    if (result.matchedCount !== 1) throw new Error('Category hierarchy state unavailable');
}
async function runHierarchyAdminMutation(req, mutation) {
    await prepare();
    return runAuditedAdminMutation(req, async session => { await coordinate(session); return mutation(session); });
}
async function runHierarchyMutation(mutation, { connection = State.db } = {}) {
    await prepare(connection);
    const session = await connection.startSession();
    try { return await session.withTransaction(async () => { await coordinate(session, connection); return mutation(session); }, transactionOptions); }
    finally { await session.endSession(); }
}
async function validateParent(value, targetId, session, { existing = false, connection = Category.db } = {}) {
    if (existing && value != null && !isId(value)) throw failure('CATEGORY_HIERARCHY_DATA_INCONSISTENT', 'A hierarquia de categorias possui dados inconsistentes.');
    let id = parentId(value), first = true;
    const visited = new Set();
    while (id) {
        if (targetId && String(id) === String(targetId)) {
            throw failure(existing ? 'CATEGORY_HIERARCHY_DATA_INCONSISTENT' : 'CATEGORY_HIERARCHY_CYCLE', 'Uma categoria não pode ser vinculada a si mesma ou às suas subcategorias.');
        }
        if (visited.has(String(id))) throw failure('CATEGORY_HIERARCHY_DATA_INCONSISTENT', 'A hierarquia de categorias possui dados inconsistentes.');
        visited.add(String(id));
        const ancestor = await connection.db.collection('categories').findOne({ _id: id }, { session, projection: { parent_id: 1 } });
        if (!ancestor) throw failure(first && !existing ? 'CATEGORY_PARENT_NOT_FOUND' : 'CATEGORY_HIERARCHY_DATA_INCONSISTENT', 'Categoria pai não encontrada.');
        if (ancestor.parent_id != null && !isId(ancestor.parent_id)) throw failure('CATEGORY_HIERARCHY_DATA_INCONSISTENT', 'A hierarquia de categorias possui dados inconsistentes.');
        id = ancestor.parent_id == null ? null : new mongoose.Types.ObjectId(ancestor.parent_id);
        first = false;
    }
    return parentId(value);
}
async function assertDeletable(category, session) {
    if (await Category.exists({ parent_id: category._id }).session(session)) throw failure('CATEGORY_HAS_CHILDREN', 'Remova ou mova as subcategorias antes de excluir esta categoria.');
    if (await Product.exists({ $or: [{ category_id: category._id }, { category: category.name }] }).session(session)) throw failure('CATEGORY_IN_USE', 'Esta categoria possui produtos. Mova ou remova os produtos antes de excluir.');
}
async function validateCurrent(category, session) {
    // Read raw BSON so invalid legacy fields cannot disappear during hydration.
    const raw = await Category.collection.findOne({ _id: category._id }, { session, projection: { parent_id: 1 } });
    await validateParent(raw.parent_id, category._id, session, { existing: true });
}
function validateBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorHander('Informe um objeto válido.', 400);
}
module.exports = { singleton, prepare, coordinate, runHierarchyAdminMutation, runHierarchyMutation, validateParent, validateCurrent, validateBody, assertDeletable, failure, isId };
