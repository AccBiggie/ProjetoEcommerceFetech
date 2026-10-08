import axios, { AxiosHeaders } from 'axios';
import store from '../store';
import { LOAD_USER_FAIL } from '../constants/userConstants';

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
axios.interceptors.response.use(response => response, error => {
    const target = new URL(axios.getUri(error.config || {}), window.location.origin);
    if (error.response?.status === 401 && target.origin === window.location.origin &&
        /^\/api\/v1(?:\/|$)/i.test(target.pathname) && store.getState().user.isAuthenticated) {
        store.dispatch({ type: LOAD_USER_FAIL, payload: null });
    }
    return Promise.reject(error);
});
