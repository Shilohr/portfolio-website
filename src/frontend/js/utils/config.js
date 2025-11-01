// API Configuration Utility
// Provides environment-agnostic API base URL configuration

class ApiConfig {
    constructor() {
        this.apiBase = this.getApiBase();
    }

    getApiBase() {
        // Check for environment variable first (for builds that can inject it)
        if (typeof window !== 'undefined' && window.API_BASE_URL) {
            return window.API_BASE_URL;
        }

        // Check for meta tag configuration
        const metaTag = document.querySelector('meta[name="api-base-url"]');
        if (metaTag && metaTag.content) {
            return metaTag.content;
        }

        // Derive from current origin for environment-agnostic behavior
        if (typeof window !== 'undefined' && window.location) {
            const origin = window.location.origin;
            return `${origin}/api`;
        }

        // Fallback to relative path (most reliable option)
        return '/api';
    }

    getApiUrl(endpoint) {
        // Ensure endpoint starts with /
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${this.apiBase}${cleanEndpoint}`;
    }

    // Helper method to get full URL for API calls
    getFullUrl(path, params = null) {
        let url = this.getApiUrl(path);
        
        if (params) {
            const searchParams = new URLSearchParams(params);
            url += `?${searchParams.toString()}`;
        }
        
        return url;
    }
}

// Create singleton instance
const apiConfig = new ApiConfig();

export default apiConfig;
export { ApiConfig };