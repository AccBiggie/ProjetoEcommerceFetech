const domain = require('./productDomain');
const { readCents } = require('./money');
const { validStock } = require('./inventory');
const { validMovement } = require('./stockMovementContract');
const { assessReviews } = require('./reviewContract');
async function auditProducts(connection, { write = console.log } = {}) {
    // Snapshot reads across collections prevent false ledger mismatches during
    // concurrent committed reservations/adjustments. No write transaction.
    const session = await connection.startSession({ snapshot: true });
    try {
        const products = await connection.collection('products').find({}, { session, projection: {
            _id: 1, price: 1, oldPrice: 1, installmmentPrice: 1, priceCents: 1, oldPriceCents: 1, installmmentPriceCents: 1,
            off: 1, Stock: 1, category: 1, category_id: 1, images: 1, reviews: 1, ratings: 1, numOfReviews: 1, stockLedgerVersion: 1,
        } }).toArray();
        const categories = new Map((await connection.collection('categories').find({}, { session, projection: { _id: 1, name: 1 } }).toArray()).map(c => [String(c._id), c.name]));
        const movements = await connection.collection('stockmovements').find({}, { session, projection: { _id: 1, product: 1, order: 1, type: 1, quantity: 1, delta: 1, stockBefore: 1, stockAfter: 1, actorUserId: 1, reason: 1 } }).toArray();
        const issues = [], add = (code, id) => issues.push({ code, productId: String(id) });
        let legacyLedgerProducts = 0;
        for (const p of products) {
            let commercial;
            try { readCents(p, 'price'); } catch { add('PRODUCT_PRICE_INVALID', p._id); }
            try { commercial = domain.commercial(p); }
            catch (e) { if (e.code === 'PRODUCT_PRICE_RELATION_INVALID' || !issues.some(i => i.productId === String(p._id) && i.code === 'PRODUCT_PRICE_INVALID')) add('PRODUCT_OLD_PRICE_INVALID', p._id); }
            if (commercial) {
                if (p.off !== commercial.off) add('PRODUCT_DISCOUNT_MISMATCH', p._id);
                try { if (readCents(p, 'installmmentPrice') !== commercial.installmmentPriceCents) add('PRODUCT_INSTALLMENT_MISMATCH', p._id); }
                catch { add('PRODUCT_INSTALLMENT_MISMATCH', p._id); }
            }
            if (!validStock(p.Stock)) add('PRODUCT_STOCK_INVALID', p._id);
            if (!p.category_id || !categories.has(String(p.category_id))) add('PRODUCT_CATEGORY_MISSING', p._id);
            else if (categories.get(String(p.category_id)) !== p.category) add('PRODUCT_CATEGORY_MISMATCH', p._id);
            for (const code of assessReviews(p)) add('PRODUCT_' + code, p._id);
            try { domain.images(p.images, { stored: true }); } catch (e) { add(e.code || 'PRODUCT_IMAGE_INVALID', p._id); }
            const rows = movements.filter(m => String(m.product) === String(p._id));
            const invalid = rows.some(m => !validMovement(m));
            if (invalid) add('PRODUCT_LEDGER_MISMATCH', p._id);
            if (p.stockLedgerVersion === 1 && !invalid && validStock(p.Stock)) {
                const total = rows.reduce((sum, m) => sum + BigInt(m.type === 'RESERVE' ? -m.quantity : m.delta), 0n);
                if (total !== BigInt(p.Stock) || rows.filter(m => m.type === 'INITIAL_STOCK').length > 1) add('PRODUCT_LEDGER_MISMATCH', p._id);
            } else if (p.stockLedgerVersion !== 1) legacyLedgerProducts++;
        }
        const ids = new Set(products.map(p => String(p._id)));
        for (const m of movements) if (!ids.has(String(m.product))) add('PRODUCT_LEDGER_ORPHAN', m.product);
        const summary = { mode: 'READ_ONLY', products: products.length, movements: movements.length, legacyLedgerProducts, issues: issues.length };
        write(JSON.stringify(summary)); for (const issue of issues) write(JSON.stringify(issue));
        return { summary, issues };
    } finally { await session.endSession(); }
}
module.exports = { auditProducts };
