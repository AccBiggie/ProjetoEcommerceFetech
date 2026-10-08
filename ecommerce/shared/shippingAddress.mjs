// Contrato canônico compartilhado; não converte números em texto.
export const shippingFields = Object.freeze({
    recipientName: { label: 'Nome do destinatário', max: 120 },
    address: { label: 'Endereço', max: 200 },
    number: { label: 'Número', max: 30 },
    complement: { label: 'Complemento', max: 120, optional: true },
    neighborhood: { label: 'Bairro', max: 120 },
    city: { label: 'Cidade', max: 120 },
    state: { label: 'Estado', max: 80 },
    country: { label: 'País', max: 80 },
    pinCode: { label: 'CEP', max: 8, pattern: /^[0-9]{8}$/, message: 'Informe um CEP com 8 dígitos.' },
    phoneNo: { label: 'Telefone', max: 15, pattern: /^[0-9]{10,15}$/, message: 'Informe um telefone com 10 a 15 dígitos, incluindo DDD.' },
});
export class ShippingValidationError extends Error {
    constructor(message, field) { super(message); this.statusCode = 400; this.field = field; }
}
export function normalizeShippingField(field, value) {
    const rule = shippingFields[field];
    if (value === undefined && rule.optional) return '';
    if (typeof value !== 'string') throw new ShippingValidationError(`${rule.label} deve ser informado como texto.`, field);
    const text = value.trim();
    if ((!rule.optional && !text) || text.length > rule.max || (rule.pattern && !rule.pattern.test(text))) {
        throw new ShippingValidationError(rule.message || `${rule.label}: informe um texto válido com até ${rule.max} caracteres.`, field);
    }
    return text;
}
export function normalizeShippingAddress(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShippingValidationError('Dados de entrega inválidos.', 'shippingInfo');
    return Object.fromEntries(Object.keys(shippingFields).map(field => [field, normalizeShippingField(field, value[field])]));
}
