const Category = require("../models/categoryModel");
const Product = require("../models/productModel");
const ErrorHander = require("./errorHander");

const categoryName = value => {
    if (typeof value !== "string") throw new ErrorHander("Informe o nome da categoria.", 400);
    const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) throw new ErrorHander("O nome da categoria deve ter de 1 a 80 caracteres.", 400);
    return name;
};
const categoryKey = name => categoryName(name).toLocaleLowerCase("pt-BR");

async function resolveProductCategory(body, session) {
    const { isId } = require('../services/categoryHierarchyService');
    let category;
    if (body.category_id !== undefined) {
        if (!isId(body.category_id)) throw new ErrorHander("Identificador de categoria inválido.", 400);
        category = await Category.findById(body.category_id).session(session || null);
    } else if (body.category !== undefined) {
        category = await Category.findOne({ name_key: categoryKey(body.category) }).session(session || null);
    } else {
        return {};
    }
    if (!category) throw new ErrorHander("Selecione uma categoria cadastrada.", 400);
    if (body.category_id !== undefined && body.category !== undefined && categoryKey(body.category) !== category.name_key) {
        require('./productDomain').fail('PRODUCT_CATEGORY_MISMATCH');
    }
    return { category_id: category._id, category: category.name };
}

// Migração aditiva: somente produtos antigos sem referência de categoria.
// Não recria categorias apagadas nem substitui vínculos já existentes.
async function migrateLegacyCategories() {
    await Category.init();
    const legacy = { $or: [{ category_id: { $exists: false } }, { category_id: null }] };
    const names = await Product.distinct("category", legacy);
    for (const value of names) {
        const name = categoryName(value);
        await require('../services/categoryHierarchyService').runHierarchyMutation(async session => {
            const category = await Category.findOneAndUpdate({ name_key: categoryKey(name) },
                { $setOnInsert: { name, parent_id: null } }, { upsert: true, returnDocument: "after", runValidators: true, session });
            await Product.updateMany({ ...legacy, category: value }, { $set: { category_id: category._id, category: category.name } }, { session });
        });
    }
}

module.exports = { categoryName, categoryKey, resolveProductCategory, migrateLegacyCategories };
