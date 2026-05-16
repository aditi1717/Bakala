import axios from 'axios';
import { getBaseUrl } from './baseUrl';

// Module Configuration - The Single Source of Truth for Role-Based Auth
const MODULE_CONFIG = {
    restaurant: {
        prefixes: ['/food/restaurant', '/restaurant'],
        storageKeys: ['restaurant_accessToken', 'auth_restaurant', 'restaurant_refreshToken', 'restaurant_user'],
        loginPath: '/food/restaurant/login',
        authHeader: 'Authorization',
    },
    seller: {
        prefixes: ['/seller'],
        storageKeys: ['auth_seller', 'seller_accessToken', 'seller_refreshToken', 'seller_user'],
        loginPath: '/seller/auth',
        authHeader: 'Authorization',
    },
    admin: {
        prefixes: ['/admin'],
        storageKeys: ['auth_admin', 'admin_accessToken', 'admin_refreshToken', 'admin_user'],
        loginPath: '/admin/auth',
        authHeader: 'Authorization',
    },
    delivery: {
        prefixes: ['/delivery', '/food/delivery'],
        storageKeys: ['auth_delivery', 'delivery_accessToken', 'delivery_refreshToken', 'delivery_user'],
        loginPath: '/delivery/auth',
        authHeader: 'Authorization',
    },
    customer: {
        prefixes: ['/customer', '/cart', '/wishlist', '/checkout', '/user'],
        storageKeys: ['auth_customer', 'user_accessToken', 'user_refreshToken', 'user_user', 'token'],
        loginPath: '/login',
        authHeader: 'Authorization',
    }
};

const axiosInstance = axios.create({
    baseURL: getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30s timeout
});

/**
 * Helper to determine the active module based on URL, context, or page path.
 */
const resolveModule = (config) => {
    const url = config.url || '';
    const pagePath = window.location.pathname;
    const contextModule = config.contextModule;

    // 1. Explicit Context (Highest Priority)
    if (contextModule && MODULE_CONFIG[contextModule]) return contextModule;

    // 2. URL Prefix detection
    for (const [module, settings] of Object.entries(MODULE_CONFIG)) {
        if (settings.prefixes.some(p => url.startsWith(p))) return module;
    }

    // 3. Page Path detection (Fallback for generic APIs like /auth/me or /products)
    for (const [module, settings] of Object.entries(MODULE_CONFIG)) {
        if (settings.prefixes.some(p => pagePath.startsWith(p) || pagePath.includes(p + '/'))) return module;
    }

    return 'customer'; // Default fallback
};

/**
 * Helper to get the best available token for a module.
 */
const getModuleToken = (module) => {
    const keys = MODULE_CONFIG[module]?.storageKeys || [];
    for (const key of keys) {
        const token = localStorage.getItem(key);
        if (token) return token;
    }
    return null;
};

// Request Interceptor: Attach correct token based on module isolation rules
axiosInstance.interceptors.request.use(
    (config) => {
        const module = resolveModule(config);
        const token = getModuleToken(module);

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Track the identified module for error handling
        config.identifiedModule = module;
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: Handle auth failures with role precision
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        const module = originalRequest?.identifiedModule || 'customer';
        const config = MODULE_CONFIG[module];

        // Handle 401 Unauthorized (Session Expired/Invalid)
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Avoid redirect loops on auth/login pages
            const currentPath = window.location.pathname;
            const isAuthPage = Object.values(MODULE_CONFIG).some(m => currentPath.includes(m.loginPath));
            
            if (isAuthPage) {
                return Promise.reject(error);
            }

            // Clear ONLY the keys for the failing module to prevent cross-module logout
            if (config) {
                config.storageKeys.forEach(key => localStorage.removeItem(key));
                
                // Final safety: also clear generic 'token'
                localStorage.removeItem('token');

                // Redirect to the module-specific login page
                window.location.href = config.loginPath;
            }
        }

        // Handle 403 Forbidden (Right user, wrong permissions)
        if (status === 403) {
            console.error(`[Access Denied] User is authenticated but lacks permissions for module: ${module}`);
            // Optionally redirect to a 403 page instead of logging out
        }

        return Promise.reject(error);
    }
);

export default axiosInstance;
