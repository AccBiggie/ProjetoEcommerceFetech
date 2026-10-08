const mongoose = require("mongoose");
const { runAuditedAdminMutation } = require('../services/adminAuditService');
const Category = require("../models/categoryModel");
const Product = require("../models/productModel");
const ErrorHander = require("../utils/errorHander");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { categoryName, categoryKey } = require("../utils/categories");

async function categoryInput(body, current, session) {
    const input = {};
    if (!current || body.name !== undefined) {
        input.name = categoryName(body.name);
        input.name_key = categoryKey(input.name);
        const duplicate = await Category.findOne({ name_key: input.name_key }).session(session || null);
        if (duplicate && !duplicate._id.equals(current?._id)) throw new ErrorHander("Já existe uma categoria com este nome.", 400);
    }
    if (body.parent_id !== undefined || !current) {
        const parentId = body.parent_id ?? null;
        if (parentId !== null && !mongoose.isObjectIdOrHexString(parentId)) throw new ErrorHander("Identificador da categoria pai inválido.", 400);
        if (parentId !== null) {
            const visited = new Set(current ? [String(current._id)] : []);
            let ancestorId = parentId;
            while (ancestorId) {
                if (visited.has(String(ancestorId))) throw new ErrorHander("Uma categoria não pode ser vinculada a si mesma ou às suas subcategorias.", 400);
                visited.add(String(ancestorId));
                const ancestor = await Category.findById(ancestorId).session(session || null);
                if (!ancestor) throw new ErrorHander("Categoria pai não encontrada.", 400);
                ancestorId = ancestor.parent_id;
            }
        }
        input.parent_id = parentId;
    }
    return input;
}

exports.getCategories = catchAsyncErrors(async (req, res, next) => {
    const filter = {};
    if (req.query.parent_id !== undefined) {
        if (req.query.parent_id === "null") filter.parent_id = null;
        else if (mongoose.isObjectIdOrHexString(req.query.parent_id)) filter.parent_id = req.query.parent_id;
        else return next(new ErrorHander("Identificador da categoria pai inválido.", 400));
    }
    res.json({ success: true, categories: await Category.find(filter).sort({ createdAt: 1, _id: 1 }) });
});
exports.getCategory = catchAsyncErrors(async (req, res, next) => {
    const category = await Category.findById(req.params.id);
    if (!category) return next(new ErrorHander("Categoria não encontrada.", 404));
    res.json({ success: true, category });
});
exports.createCategory = catchAsyncErrors(async (req, res) => {
    const category = await runAuditedAdminMutation(req, async session => {
        const [value] = await Category.create([await categoryInput(req.body, undefined, session)], { session });
        return { value, event: { action: 'CATEGORY_CREATED', targetId: value._id } };
    });
    res.status(201).json({ success: true, category });
});
exports.updateCategory = catchAsyncErrors(async (req, res, next) => {
    const category = await runAuditedAdminMutation(req, async session => {
        const current = await Category.findById(req.params.id).session(session);
        if (!current) throw new ErrorHander('Categoria não encontrada.', 404);
        const input = await categoryInput(req.body, current, session);
        const value = await Category.findByIdAndUpdate(current._id, input, { returnDocument: 'after', runValidators: true, session });
        if (value.name !== current.name) await Product.updateMany({ category_id: value._id }, { $set: { category: value.name } }, { session });
        const changedFields = ['name','parent_id'].filter(key => String(current[key]) !== String(value[key]));
        return { value, event: { action: 'CATEGORY_UPDATED', targetId: value._id, metadata: { changedFields } } };
    });
    res.json({ success: true, category });
});
exports.deleteCategory = catchAsyncErrors(async (req, res, next) => {
    await runAuditedAdminMutation(req, async session => {
        const category = await Category.findById(req.params.id).session(session);
        if (!category) throw new ErrorHander('Categoria não encontrada.', 404);
        if (await Category.exists({ parent_id: category._id }).session(session)) throw new ErrorHander('Remova ou mova as subcategorias antes de excluir esta categoria.', 409);
        if (await Product.exists({ $or: [{ category_id: category._id }, { category: category.name }] }).session(session)) throw new ErrorHander('Esta categoria possui produtos. Mova ou remova os produtos antes de excluir.', 409);
        await category.deleteOne({ session });
        return { event: { action: 'CATEGORY_DELETED', targetId: category._id } };
    });
    res.json({ success: true, message: "Categoria removida." });
});
