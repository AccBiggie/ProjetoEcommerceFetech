// Classification only. This registry does not invent retention law or schedule erasure.
const category = (store, fields, classification, purpose, anonymization, retention) => Object.freeze({ store, fields: Object.freeze(fields), classification, purpose, anonymization, retention, retentionPeriod: 'UNDEFINED' });
const registry = Object.freeze([
    category('Order', ['cancelledByUserId'], 'PSEUDONYMOUS_IDENTIFIER', 'Autoria do cancelamento comercial', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('User', ['name', 'email', 'avatar'], 'DIRECT_PII', 'Perfil/contato', 'REPLACE_WITH_TOMBSTONE', 'UNTIL_ACCOUNT_ANONYMIZATION'),
    category('User', ['password', 'resetPasswordToken', 'resetPasswordExpire', 'tokenVersion'], 'SECURITY_CREDENTIAL', 'Autenticação', 'ROTATE_AND_REVOKE', 'UNTIL_ACCOUNT_ANONYMIZATION'),
    category('User', ['_id', 'createdAt', 'deactivatedBy', 'role', 'accountStatus', 'privacyStatus'], 'PSEUDONYMOUS_IDENTIFIER', 'Integridade referencial', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('Address', ['recipientName', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'country', 'pinCode', 'phoneNo', 'label'], 'SHIPPING_PII', 'Catálogo privado', 'REMOVE', 'UNTIL_ACCOUNT_ANONYMIZATION'),
    category('Order', ['shippingInfo'], 'SHIPPING_PII', 'Snapshot comercial histórico', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('Order', ['user', 'orderItems', 'paymentInfo', 'inventoryStatus', 'money', 'archive'], 'COMMERCIAL_HISTORY', 'Integridade comercial', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('Product.reviews', ['name', 'user', 'rating', 'comment'], 'PUBLIC_USER_CONTENT', 'Avaliação pública', 'REPLACE_NAME_ONLY', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('AdminAuditEvent', ['actorUserId', 'targetId', 'requestId', 'action', 'metadata'], 'ADMIN_AUDIT', 'Trilha append-only', 'PRESERVE', 'PERMANENT_AUDIT_UNTIL_POLICY_DEFINED'),
    category('OrderIdempotency', ['user', 'keyHash', 'requestHash', 'order'], 'COMMERCIAL_HISTORY', 'Prevenção de duplicidade', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('StockMovement', ['actorUserId', 'order', 'product', 'quantities'], 'COMMERCIAL_HISTORY', 'Ledger de estoque', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('AuthRateLimit', ['_id', 'scope', 'count', 'pending', 'expiresAt'], 'SECURITY_EPHEMERAL', 'HMAC conta/IP e proteção contra abuso', 'PRESERVE_ACTIVE_BUCKETS', 'EPHEMERAL_TECHNICAL'),
    category('MediaUploadIntent/MediaCleanupTask', ['user', 'publicId', 'status', 'failureCode'], 'PSEUDONYMOUS_IDENTIFIER', 'Lifecycle durável de mídia', 'DETACH_AND_QUEUE_SAFE_CLEANUP', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('PrivacyRequest', ['user', 'processedBy', 'requestId', 'status', 'timestamps'], 'PSEUDONYMOUS_IDENTIFIER', 'Solicitação sem cópia de PII direta', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('EmailOutbox', ['recipientUserId', 'entityId', 'dedupeKey', 'requestId'], 'PSEUDONYMOUS_IDENTIFIER', 'Notificação transacional sem cópia de email/body', 'SUPPRESS_PENDING_DELIVERY_FOR_ANONYMIZED_USER', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('AdminMutationLock/CategoryHierarchyState', ['owner', 'bootstrapUserId', 'fence', 'revision'], 'TECHNICAL_METADATA', 'Concorrência e fencing', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('Category/Product', ['name', 'description', 'images', 'user'], 'PUBLIC_USER_CONTENT', 'Catálogo e autoria', 'PRESERVE', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('Logs', ['requestId', 'userId', 'routeTemplate', 'action', 'code'], 'TECHNICAL_METADATA', 'Observabilidade sem corpo/PII direta', 'NO_DIRECT_PII', 'HISTORICAL_RETENTION_UNDEFINED'),
    category('localStorage', ['shippingInfo'], 'SHIPPING_PII', 'Draft não vinculado a conta; remoção seletiva pelo usuário', 'NO_GENERIC_CLEAR', 'UNTIL_USER_SELECTIVE_REMOVAL'),
    category('localStorage/sessionStorage', ['cartItems', 'fetech-color-mode', 'fetech.orderAttempt.v1'], 'TECHNICAL_METADATA', 'Carrinho factual/tema/recuperação comercial', 'PRESERVE_UNCERTAIN_ATTEMPT', 'UNTIL_USER_SELECTIVE_REMOVAL'),
]);
module.exports = { registry };
