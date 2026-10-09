// Only indexes justified by the collection queries in PAGINACAO_E_PERFORMANCE_API.md.
const definitions = {
    products: [
        [{ createdAt: -1, _id: -1 }, 'products_recent'],
        [{ category_id: 1, createdAt: -1, _id: -1 }, 'products_category_recent'],
        [{ category: 1, createdAt: -1, _id: -1 }, 'products_legacy_category_recent'],
    ],
    orders: [
        [{ createdAt: -1, _id: -1 }, 'orders_recent'],
        [{ user: 1, createdAt: -1, _id: -1 }, 'orders_customer_recent'],
        [{ administrativeArchivedAt: 1, createdAt: -1, _id: -1 }, 'orders_archive_recent'],
    ],
    users: [
        [{ createdAt: -1, _id: -1 }, 'users_recent'],
        [{ accountStatus: 1, createdAt: -1, _id: -1 }, 'users_status_recent'],
    ],
    categories: [
        [{ createdAt: 1, _id: 1 }, 'categories_tree'],
        [{ parent_id: 1, createdAt: 1, _id: 1 }, 'categories_parent_tree'],
    ],
    addresses: [[{ user: 1, favorite: -1, createdAt: -1, _id: -1 }, 'addresses_customer_favorite']],
    adminauditevents: [[{ requestId: 1, createdAt: -1, _id: -1 }, 'audit_request_recent']],
};
function add(schema, collection) {
    for (const [key, name] of definitions[collection]) schema.index(key, { name });
}
const manifest = Object.entries(definitions).flatMap(([collection, indexes]) => indexes.map(([key, name]) => ({ collection, key, name })));
// Include commercial invariant indexes without altering their existing semantics.
manifest.push({ collection: 'stockmovements', name: 'one_order_product_reserve', key: { order: 1, product: 1, type: 1 }, unique: true, partialFilterExpression: { type: 'RESERVE' } });
manifest.push({ collection: 'orderidempotencies', name: 'one_order_intent', key: { user: 1, operation: 1, keyHash: 1 }, unique: true });
manifest.push({ collection: 'stockmovements', name: 'product_1', key: { product: 1 } });
manifest.push({ collection: 'orders', name: 'one_order_per_key', key: { user: 1, idempotencyKeyHash: 1 }, unique: true, partialFilterExpression: { idempotencyKeyHash: { $type: 'string' } } });
manifest.push({ collection: 'users', name: 'email_1', key: { email: 1 }, unique: true });
manifest.push({ collection: 'categories', name: 'name_key_1', key: { name_key: 1 }, unique: true });
manifest.push({ collection: 'addresses', name: 'one_favorite_per_user', key: { user: 1 }, unique: true, partialFilterExpression: { favorite: true } });
manifest.push({ collection: 'authratelimits', name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 });
manifest.push({ collection: 'mediacleanuptasks', name: 'provider_1_publicId_1', key: { provider: 1, publicId: 1 }, unique: true });
manifest.push({ collection: 'mediauploadintents', name: 'publicId_1', key: { publicId: 1 }, unique: true });
for (const collection of ['mediacleanuptasks','mediauploadintents']) manifest.push({ collection, name: 'status_1_updatedAt_1', key: { status: 1, updatedAt: 1 } });
for (const key of [{ createdAt: -1, _id: -1 }, { action: 1, createdAt: -1, _id: -1 }, { targetType: 1, targetId: 1, createdAt: -1, _id: -1 }, { actorUserId: 1, createdAt: -1, _id: -1 }]) manifest.push({ collection: 'adminauditevents', key, name: Object.entries(key).map(([field, direction]) => field + '_' + direction).join('_') });
module.exports = { definitions, add, manifest };
