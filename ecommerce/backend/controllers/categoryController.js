const mongoose = require("mongoose");
const { runHierarchyAdminMutation, validateParent, validateCurrent, validateBody, assertDeletable } = require('../services/categoryHierarchyService');
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
        input.parent_id = await validateParent(body.parent_id ?? null, current?._id, session);
    }
    return input;
}

exports.getCategories = catchAsyncErrors(async (req, res, next) => {
    const paging = require('../utils/pagination');
    paging.queryContract(req, ['parent_id']);
    const filter = {};
    if (req.query.parent_id !== undefined) {
        if (req.query.parent_id === "null") filter.parent_id = null;
        else if (mongoose.isObjectIdOrHexString(req.query.parent_id)) filter.parent_id = req.query.parent_id;
        else return next(new ErrorHander("Identificador da categoria pai inválido.", 400));
    }
    res.json({ success: true, categories: await paging.reference(Category, filter, { createdAt: 1, _id: 1 }, 1000, '_id name parent_id createdAt') });
});
exports.getCategory = catchAsyncErrors(async (req, res, next) => {
    const category = await Category.findById(req.params.id);
    if (!category) return next(new ErrorHander("Categoria não encontrada.", 404));
    res.json({ success: true, category });
});
exports.createCategory = catchAsyncErrors(async (req, res) => {
    validateBody(req.body);
    const category = await runHierarchyAdminMutation(req, async session => {
        const [value] = await Category.create([await categoryInput(req.body, undefined, session)], { session });
        return { value, event: { action: 'CATEGORY_CREATED', targetId: value._id } };
    });
    res.status(201).json({ success: true, category });
});
exports.updateCategory = catchAsyncErrors(async (req, res, next) => {
    validateBody(req.body);
    const category = await runHierarchyAdminMutation(req, async session => {
        const current = await Category.findById(req.params.id).session(session);
        if (!current) throw new ErrorHander('Categoria não encontrada.', 404);
        await validateCurrent(current, session);
        const input = await categoryInput(req.body, current, session);
        const value = await Category.findByIdAndUpdate(current._id, input, { returnDocument: 'after', runValidators: true, session });
        if (value.name !== current.name) await Product.updateMany({ category_id: value._id }, { $set: { category: value.name } }, { session });
        const changedFields = ['name','parent_id'].filter(key => String(current[key]) !== String(value[key]));
        return { value, event: { action: 'CATEGORY_UPDATED', targetId: value._id, metadata: { changedFields } } };
    });
    res.json({ success: true, category });
});
exports.deleteCategory = catchAsyncErrors(async (req, res, next) => {
    await runHierarchyAdminMutation(req, async session => {
        const category = await Category.findById(req.params.id).session(session);
        if (!category) throw new ErrorHander('Categoria não encontrada.', 404);
        await validateCurrent(category, session);
        await assertDeletable(category, session);
        await category.deleteOne({ session });
        return { event: { action: 'CATEGORY_DELETED', targetId: category._id } };
    });
    res.json({ success: true, message: "Categoria removida." });
});
