const { shippingFields, normalizeShippingField, normalizeShippingAddress } = require('../../shared/shippingAddress.mjs');

function inspectShippingSnapshot(order) {
    const categories = new Set(), affected = new Set();
    const shipping = order.shippingInfo;
    const current = order.shippingInfoVersion === 2;
    let valid = true;
    try { normalizeShippingAddress(shipping); } catch { valid = false; }
    if (current && valid) categories.add('CURRENT_VALID');
    else if (current) categories.add('CURRENT_INVALID');
    else if (valid) categories.add('LEGACY_VALID_STORED_VALUE');
    for (const [field, rule] of Object.entries(shippingFields)) {
        const value = shipping?.[field];
        if (!rule.optional && value === undefined) {
            categories.add('LEGACY_MISSING_FIELDS'); affected.add(field);
        } else if ((field === 'pinCode' || field === 'phoneNo') && typeof value === 'number') {
            categories.add(field === 'pinCode' ? 'LEGACY_NUMERIC_PINCODE' : 'LEGACY_NUMERIC_PHONE'); affected.add(field);
        } else {
            try { normalizeShippingField(field, value); }
            catch { categories.add('LEGACY_INVALID_FORMAT'); affected.add(field); }
        }
    }
    if (order.shippingInfoVersion !== undefined && ![1, 2].includes(order.shippingInfoVersion)) {
        categories.delete('LEGACY_VALID_STORED_VALUE');
        categories.add('LEGACY_INVALID_FORMAT'); affected.add('shippingInfoVersion');
    }
    const id = String(order._id ?? '');
    return { ...( /^[0-9a-fA-F]{24}$/.test(id) ? { orderId: id } : {}), categories: [...categories], fields: [...affected] };
}
async function auditShippingSnapshots(connection, { write = console.log } = {}) {
    write('READ ONLY — categorias podem se sobrepor; valores e dados pessoais são omitidos.');
    const summary = { scanned: 0, categories: {} };
    const cursor = connection.collection('orders').find({}, { projection: { shippingInfo: 1, shippingInfoVersion: 1 } });
    for await (const order of cursor) {
        const report = inspectShippingSnapshot(order);
        summary.scanned++;
        for (const category of report.categories) summary.categories[category] = (summary.categories[category] || 0) + 1;
        write(JSON.stringify(report));
    }
    write(JSON.stringify(summary));
    return summary;
}
module.exports = { inspectShippingSnapshot, auditShippingSnapshots };
