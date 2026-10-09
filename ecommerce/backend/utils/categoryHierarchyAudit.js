const { isId } = require('../services/categoryHierarchyService');
const safeId = value => isId(value) ? String(value) : null;
async function auditCategories(connection, { write = console.log } = {}) {
    const rows = await connection.db.collection('categories').find({}, { projection: { _id: 1, parent_id: 1 } }).toArray();
    const categories = new Map(rows.map(row => [String(row._id), row]));
    const issues = [], completed = new Set();
    for (const row of rows) {
        if (row.parent_id != null && (!isId(row.parent_id) || !categories.has(String(row.parent_id)))) issues.push({ code: 'CATEGORY_MISSING_PARENT', categoryId: safeId(row._id), parentId: safeId(row.parent_id) });
        if (row.parent_id != null && String(row.parent_id) === String(row._id)) issues.push({ code: 'CATEGORY_SELF_PARENT', categoryId: safeId(row._id) });
        const path = [], positions = new Map();
        let id = String(row._id);
        while (categories.has(id) && !completed.has(id)) {
            if (positions.has(id)) {
                const cycle = path.slice(positions.get(id)).sort();
                issues.push({ code: 'CATEGORY_CYCLE', categoryIds: cycle.map(value => safeId(value)) });
                break;
            }
            positions.set(id, path.length); path.push(id);
            const parent = categories.get(id).parent_id;
            if (parent == null || !isId(parent)) break;
            id = String(parent);
        }
        path.forEach(value => completed.add(value));
    }
    let products = 0;
    for await (const product of connection.db.collection('products').find({}, { projection: { _id: 1, category_id: 1, category: 1 } })) {
        products++;
        // category_id is optional for legacy records; category is required.
        // Never echo arbitrary legacy category text in the report.
        if (product.category_id != null) {
            if (!isId(product.category_id) || !categories.has(String(product.category_id))) issues.push({ code: 'PRODUCT_MISSING_CATEGORY', productId: safeId(product._id), categoryId: safeId(product.category_id) });
        } else if (typeof product.category !== 'string' || !product.category.trim()) {
            issues.push({ code: 'PRODUCT_MISSING_CATEGORY', productId: safeId(product._id), categoryId: null });
        }
    }
    const summary = { mode: 'READ_ONLY', categories: rows.length, products, issues: issues.length };
    write(JSON.stringify(summary)); issues.forEach(issue => write(JSON.stringify(issue)));
    return { summary, issues };
}
module.exports = { auditCategories };
