import axios, { AxiosHeaders } from 'axios';

const unsafeMethods = new Set(['post', 'put', 'patch', 'delete']);
axios.interceptors.request.use(config => {
    if (unsafeMethods.has(String(config.method || 'get').toLowerCase())) {
        const target = new URL(axios.getUri(config), window.location.origin);
        if (target.origin === window.location.origin && /^\/api\/v1(?:\/|$)/i.test(target.pathname)) {
            config.headers = AxiosHeaders.from(config.headers);
            config.headers.set('X-Fetech-CSRF', '1');
        }
    }
    return config;
});
