function createFakeEmailProvider() {
    const fake = { calls: [], mode: 'success', responseId: '<opaque@provider.test>', beforeSend: null, closed: false };
    fake.send = async message => {
        await fake.beforeSend?.(message); fake.calls.push(message);
        if (fake.mode === 'transient' || fake.mode === 'ambiguous') { const error = new Error('PERSON_EMAIL_SENTINEL PROVIDER_BODY_SENTINEL SMTP_PASSWORD_SENTINEL raw response'); error.code = 'ETIMEDOUT'; throw error; }
        if (fake.mode === 'permanent') { const error = new Error('PRIVATE_SMTP_RESPONSE_SENTINEL'); error.responseCode = 550; throw error; }
        return { messageId: fake.responseId };
    };
    fake.close = () => { fake.closed = true; };
    return fake;
}
module.exports = { createFakeEmailProvider };
