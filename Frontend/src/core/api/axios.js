import axios from 'axios';

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

const getCustomerToken = () =>
    localStorage.getItem('auth_customer') ||
    localStorage.getItem('user_accessToken') ||
    localStorage.getItem('accessToken') ||
    null;

// Request interceptor for API calls
axiosInstance.interceptors.request.use(
    (config) => {
        let token = null;
        const url = config.url;
        const pagePath = window.location.pathname;
        const contextModule = config.contextModule;

        // 0. Priority: Explicit contextModule from the API call
        if (contextModule === 'seller') {
            token = localStorage.getItem('auth_seller');
        } else if (contextModule === 'admin') {
            token = localStorage.getItem('auth_admin');
        } else if (contextModule === 'delivery') {
            token = localStorage.getItem('auth_delivery');
        } else if (contextModule === 'restaurant') {
            token = localStorage.getItem('restaurant_accessToken') || localStorage.getItem('auth_restaurant');
        } else if (contextModule === 'customer' || contextModule === 'user') {
            token = getCustomerToken();
        }

        // 1. Fallback: If no explicit context, use page-based detection
        if (!token) {
            if (pagePath.startsWith('/seller')) {
                token = localStorage.getItem('auth_seller');
            } else if (pagePath.startsWith('/admin')) {
                token = localStorage.getItem('auth_admin');
            } else if (pagePath.startsWith('/delivery')) {
                token = localStorage.getItem('auth_delivery');
            } else if (pagePath.startsWith('/restaurant') || pagePath.startsWith('/food/restaurant')) {
                token = localStorage.getItem('restaurant_accessToken') || localStorage.getItem('auth_restaurant');
            } else if (pagePath.startsWith('/customer')) {
                token = getCustomerToken();
            }
        }

        // 2. Fallback to URL-based detection
        if (!token) {
            if (url.startsWith('/seller')) token = localStorage.getItem('auth_seller');
            else if (url.startsWith('/admin')) token = localStorage.getItem('auth_admin');
            else if (url.startsWith('/delivery')) token = localStorage.getItem('auth_delivery');
            else if (url.startsWith('/restaurant') || url.startsWith('/food/restaurant')) token = localStorage.getItem('restaurant_accessToken') || localStorage.getItem('auth_restaurant');
            else if (url.startsWith('/customer') || url.startsWith('/cart') || url.startsWith('/wishlist') || url.startsWith('/categories') || url.startsWith('/products')) {
                token = getCustomerToken();
            }
        }

        // 3. Final default: if we are on a general page and STILL no token, try customer token
        if (!token && !pagePath.startsWith('/admin') && !pagePath.startsWith('/seller') && !pagePath.startsWith('/delivery') && !pagePath.startsWith('/restaurant') && !pagePath.startsWith('/food/restaurant')) {
            token = getCustomerToken();
        }

        // 3. Last fallback: Check common 'token' key if implemented
        if (!token) {
            token = localStorage.getItem('token');
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Only reload when we had a token that's now invalid (expired/logged out elsewhere).
            // If no token exists, skip reload to avoid infinite loop on public pages.
            const hasToken = ['auth_seller', 'auth_admin', 'auth_delivery', 'auth_customer', 'user_accessToken', 'accessToken', 'token', 'restaurant_accessToken', 'auth_restaurant'].some(
                (key) => localStorage.getItem(key)
            );
            if (!hasToken) {
                return Promise.reject(error);
            }
            const path = window.location.pathname;
            const requestUrl = String(originalRequest?.url || '');
            const currentModule = (path.startsWith('/seller') || path.includes('/seller/'))
                ? 'seller'
                : (path.startsWith('/admin') || path.includes('/admin/'))
                    ? 'admin'
                    : (path.startsWith('/delivery') || path.includes('/delivery/'))
                        ? 'delivery'
                        : (path.startsWith('/restaurant') || path.includes('/restaurant/'))
                            ? 'restaurant'
                            : 'customer';
            const requestModule = originalRequest.contextModule || (requestUrl.startsWith('/seller')
                ? 'seller'
                : requestUrl.startsWith('/admin')
                    ? 'admin'
                    : requestUrl.startsWith('/delivery')
                        ? 'delivery'
                        : (requestUrl.startsWith('/restaurant') || requestUrl.startsWith('/food/restaurant'))
                            ? 'restaurant'
                            : requestUrl.startsWith('/user') || requestUrl.startsWith('/customer') || requestUrl.startsWith('/auth')
                                ? 'customer'
                                : null);

            // Avoid redirect loops if we are already on a login page
            const loginPaths = ['/login', '/user/auth', '/food/restaurant/login', '/seller/auth', '/admin/auth', '/delivery/auth', '/welcome'];
            if (loginPaths.some(lp => path.includes(lp))) {
                return Promise.reject(error);
            }

            // Prevent cross-module 401s from logging out the active session
            // (e.g. seller page accidentally calling an admin endpoint).
            if (requestModule && requestModule !== currentModule) {
                return Promise.reject(error);
            }

            const moduleStorageKeys = {
                seller: ['auth_seller', 'seller_accessToken', 'seller_refreshToken', 'seller_user', 'seller_authenticated', 'token'],
                admin: ['auth_admin', 'admin_accessToken', 'admin_refreshToken', 'admin_user', 'admin_authenticated', 'token'],
                delivery: ['auth_delivery', 'delivery_accessToken', 'delivery_refreshToken', 'delivery_user', 'delivery_authenticated', 'token'],
                restaurant: ['auth_restaurant', 'restaurant_accessToken', 'restaurant_refreshToken', 'restaurant_user', 'restaurant_authenticated', 'token'],
                customer: ['auth_customer', 'user_accessToken', 'user_refreshToken', 'user_user', 'user_authenticated', 'accessToken', 'token'],
            };
            const keysToClear = moduleStorageKeys[currentModule] || ['token'];
            keysToClear.forEach((key) => localStorage.removeItem(key));

            if (currentModule === 'seller') window.location.href = '/seller/auth';
            else if (currentModule === 'admin') window.location.href = '/admin/auth';
            else if (currentModule === 'delivery') window.location.href = '/delivery/auth';
            else if (currentModule === 'restaurant') window.location.href = '/food/restaurant/login';
            else window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
