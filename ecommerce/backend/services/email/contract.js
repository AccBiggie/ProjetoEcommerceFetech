const events = Object.freeze(['ACCOUNT_REGISTERED', 'ORDER_CREATED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'PRIVACY_REQUEST_CREATED']);
const states = Object.freeze(['PENDING', 'PROCESSING', 'RETRY', 'SENT', 'DEAD', 'SUPPRESSED']);
const policy = Object.freeze({ batch: 10, pollMs: 5000, leaseMs: 60000, shutdownMs: 5000, maxAttempts: 6, delays: Object.freeze([60000, 300000, 1800000, 7200000, 43200000]) });
const codes = Object.freeze(['EMAIL_PROVIDER_UNAVAILABLE', 'EMAIL_PROVIDER_REJECTED', 'EMAIL_PROVIDER_ERROR', 'EMAIL_TEMPLATE_ERROR', 'EMAIL_TARGET_MISSING', 'EMAIL_TARGET_INVALID', 'EMAIL_RECIPIENT_USER_MISSING', 'EMAIL_RECIPIENT_INVALID', 'EMAIL_RECIPIENT_ANONYMIZED', 'EMAIL_RECIPIENT_STATE_INVALID', 'EMAIL_LEASE_EXHAUSTED']);
function providerFailure(error) {
    if (Number.isInteger(error?.responseCode) && error.responseCode >= 500 && error.responseCode < 600) return { code: 'EMAIL_PROVIDER_REJECTED', permanent: true };
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EMAIL_PROVIDER_UNAVAILABLE'].includes(error?.code) || Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode < 500) return { code: 'EMAIL_PROVIDER_UNAVAILABLE', permanent: false };
    return { code: 'EMAIL_PROVIDER_ERROR', permanent: false };
}
module.exports = { events, states, policy, codes, providerFailure };
