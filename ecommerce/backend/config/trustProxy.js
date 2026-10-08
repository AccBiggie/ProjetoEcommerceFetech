function getTrustProxySetting(value) {
    if (!arguments.length) return require('./runtimeConfig').getRuntimeConfig().proxy.hops || false;
    if (value === undefined) return false;
    if (typeof value !== 'string' || !/^[0-5]$/.test(value)) {
        throw new Error('TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 5.');
    }
    const hops = Number(value);
    return hops === 0 ? false : hops;
}
module.exports = { getTrustProxySetting };
