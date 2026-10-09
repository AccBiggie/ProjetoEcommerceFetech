const actions = Object.freeze({
    ORDER_ARCHIVED: ['ORDER', ['archived']], ORDER_UNARCHIVED: ['ORDER', ['archived']], ORDER_STATUS_CHANGED: ['ORDER', ['from','to']],
    USER_ROLE_CHANGED: ['USER', ['fromRole','toRole']], USER_UPDATED: ['USER', ['changedFields']], USER_DELETED: ['USER', []],
    USER_DEACTIVATED: ['USER', ['fromStatus','toStatus']], USER_REACTIVATED: ['USER', ['fromStatus','toStatus']],
    PRODUCT_CREATED: ['PRODUCT', []], PRODUCT_UPDATED: ['PRODUCT', ['changedFields']], PRODUCT_DELETED: ['PRODUCT', []],
    CATEGORY_CREATED: ['CATEGORY', []], CATEGORY_UPDATED: ['CATEGORY', ['changedFields']], CATEGORY_DELETED: ['CATEGORY', []],
    PRODUCT_REVIEW_DELETED: ['PRODUCT', ['reviewId']], USER_ANONYMIZED: ['USER', ['privacyRequestId']]
});
const changedFields = new Set(['name','email','role','description','category','category_id','priceCents','oldPriceCents','installmmentPriceCents','off','countDown','Stock','images','parent_id']);
function metadataFor(action, input = {}) {
    const contract = actions[action];
    if (!contract || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !contract[1].includes(key))) throw new Error('Invalid audit metadata');
    const result = {};
    for (const key of Object.keys(input)) {
        const value = input[key];
        if (key === 'archived' && typeof value === 'boolean' && value === (action === 'ORDER_ARCHIVED')) result[key] = value;
        else if (['from','to'].includes(key) && ['Processing','Shipped','Delivered'].includes(value)) result[key] = value;
        else if (['fromRole','toRole'].includes(key) && ['admin','user'].includes(value)) result[key] = value;
        else if (['fromStatus','toStatus'].includes(key) && ['ACTIVE','DEACTIVATED'].includes(value)) result[key] = value;
        else if (['reviewId', 'privacyRequestId'].includes(key) && /^[a-f0-9]{24}$/i.test(value)) result[key] = String(value);
        else if (key === 'changedFields' && Array.isArray(value) && value.length <= changedFields.size && value.every(field => changedFields.has(field))) result[key] = [...new Set(value)].sort();
        else throw new Error('Invalid audit metadata value');
    }
    return result;
}
module.exports = { actions, changedFields, metadataFor };
