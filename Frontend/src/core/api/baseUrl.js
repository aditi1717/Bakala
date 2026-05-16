const normalizeUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

export const getBaseUrl = () => {
    if (typeof import.meta === "undefined" || !import.meta.env) {
        return "http://localhost:5000/api/v1";
    }

    return normalizeUrl(import.meta.env.VITE_API_BASE_URL) || 'http://localhost:5000/api/v1';
};
