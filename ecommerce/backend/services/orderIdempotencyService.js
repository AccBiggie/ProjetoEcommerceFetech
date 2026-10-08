const crypto = require('node:crypto');
const { ORDER_OPERATION } = require('../../shared/orderIntent.mjs');
const ErrorHander = require('../utils/errorHander');
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;
function validateKey(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw new ErrorHander('Informe Idempotency-Key com 16 a 128 caracteres: letras, números, -, _, . ou :.', 400);
    return key;
}
function requestKey(req) {
    const occurrences = (req.rawHeaders || []).filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'idempotency-key').length;
    if (occurrences > 1) throw new ErrorHander('Idempotency-Key deve possuir um único valor.', 400);
    const value = req.headers?.['idempotency-key'];
    if (value === undefined) throw new ErrorHander('Idempotency-Key é obrigatório para criar um pedido.', 400);
    return validateKey(value);
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function identity(user, key, canonical) {
    validateKey(key);
    return { user, operation: ORDER_OPERATION, keyHash: digest(key), requestHash: digest(key + '\n' + canonical) };
}
function expectedDuplicate(error, fields) {
    return error?.code === 11000 && error.keyPattern && Object.keys(error.keyPattern).length === fields.length && fields.every(field => error.keyPattern[field] === 1);
}
const coded = (code, error) => { error.code = code; return error; };
const unavailable = () => coded('ORDER_TRANSACTION_UNAVAILABLE', new ErrorHander('Não foi possível confirmar esta tentativa. Confira seus pedidos e repita a mesma solicitação.', 503));
const conflict = () => coded('ORDER_IDEMPOTENCY_CONFLICT', new ErrorHander('A Idempotency-Key já foi utilizada com dados de pedido diferentes.', 409));
const blocked = () => new ErrorHander('Esta tentativa de pedido não pode ser repetida automaticamente. Confira seus pedidos.', 409);
function createOrderIdempotencyService({ Claim = require('../models/orderIdempotencyModel'), Order = require('../models/orderModel'), waitMs = 3000, pollMs = 75 } = {}) {
    const scopeOf = id => ({ user: id.user, operation: id.operation, keyHash: id.keyHash });
    async function storedOrder(id, record) {
        const filter = { user: id.user, idempotencyKeyHash: id.keyHash };
        if (record?.status === 'COMPLETED') filter._id = record.order;
        const order = await Order.findOne(filter).select('+idempotencyKeyHash +idempotencyRequestHash');
        if (order && order.idempotencyRequestHash !== id.requestHash) throw conflict();
        return order;
    }
    async function complete(id, order, session) {
        const result = await Claim.updateOne({ ...scopeOf(id), requestHash: id.requestHash, status: 'PROCESSING' },
            { $set: { status: 'COMPLETED', order: order._id }, $unset: { failureCode: 1 } }, { session });
        if (!result.matchedCount) {
            if (session) throw unavailable();
            const record = await Claim.findOne(scopeOf(id));
            if (record?.status !== 'COMPLETED' || record.requestHash !== id.requestHash || String(record.order) !== String(order._id)) throw unavailable();
        }
    }
    async function existing(id, record) {
        const deadline = Date.now() + waitMs;
        while (record) {
            if (record.requestHash !== id.requestHash) throw conflict();
            if (record.status === 'FAILED') {
                if (record.failureCode === 'ORDER_INSUFFICIENT_STOCK') throw require('../utils/inventory').insufficientStock();
                throw blocked();
            }
            const order = await storedOrder(id, record);
            if (order) {
                if (record.status === 'PROCESSING') await complete(id, order);
                return { order, replayed: true };
            }
            if (record.status === 'COMPLETED') throw blocked(); // Pedido excluído nunca é recriado.
            if (Date.now() >= deadline) {
                const error = new ErrorHander('Este pedido ainda está sendo processado. Repita a mesma solicitação em alguns instantes.', 409);
                error.code = 'ORDER_IDEMPOTENCY_PROCESSING'; error.retryAfter = 2; throw error;
            }
            await new Promise(resolve => setTimeout(resolve, pollMs));
            record = await Claim.findOne(scopeOf(id));
        }
        throw unavailable();
    }
    async function execute({ user, key, canonical, prepare, create }) {
        const id = identity(user, key, canonical), scope = scopeOf(id);
        try {
            const previous = await Claim.findOne(scope);
            if (previous) return await existing(id, previous);
            let recovered = await storedOrder(id);
            // Preconditions atuais só são necessárias para uma intenção ainda não persistida.
            let prepared;
            if (!recovered) {
                try { prepared = await prepare(); }
                catch (error) {
                    // Outro owner pode ter reservado/commitado desde a primeira leitura.
                    // Uma recusa de catálogo não pode encerrar uma intenção já persistida.
                    const raced = await Claim.findOne(scope);
                    if (raced) return await existing(id, raced);
                    recovered = await storedOrder(id);
                    if (!recovered) throw error;
                }
            }
            try { await Claim.create({ ...id, status: 'PROCESSING' }); }
            catch (error) {
                if (!expectedDuplicate(error, ['user', 'operation', 'keyHash'])) throw error;
                return await existing(id, await Claim.findOne(scope));
            }
            let order, replayed;
            try {
                const savedBeforeCreate = recovered || await storedOrder(id);
                replayed = Boolean(savedBeforeCreate);
                order = savedBeforeCreate || await create(prepared, {
                    idempotencyKeyHash: id.keyHash, idempotencyRequestHash: id.requestHash,
                }, (created, session) => complete(id, created, session));
            } catch (error) {
                if (expectedDuplicate(error, ['user', 'idempotencyKeyHash'])) {
                    const saved = await storedOrder(id);
                    if (saved) { await complete(id, saved); return { order: saved, replayed: true }; }
                }
                // Resultado de write ambíguo: procurar o Order antes de considerar FAILED.
                const saved = await storedOrder(id);
                if (saved) { await complete(id, saved); return { order: saved, replayed: true }; }
                if (error.code === 'ORDER_INSUFFICIENT_STOCK') {
                    await Claim.updateOne({ ...scope, status: 'PROCESSING' }, { $set: { status: 'FAILED', failureCode: error.code } });
                    throw error;
                }
                // Erros operacionais/commit ambíguo permanecem PROCESSING, sem takeover.
                throw unavailable();
            }
            // Se a confirmação falhar, permanece PROCESSING e o Order permite reconciliação.
            if (replayed) await complete(id, order);
            return { order, replayed };
        } catch (error) {
            if (error.statusCode) throw error;
            throw unavailable(); // Não expor Mongo/stack/chaves/payload.
        }
    }
    return { execute };
}
module.exports = { createOrderIdempotencyService, validateKey, requestKey, identity };
