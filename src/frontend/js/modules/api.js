// ===================================
// API MODULE
// ===================================

class ApiModule {
    constructor() {
        this.baseUrl = window.location.origin + '/api';
        this.cache = new Map();
        this.requestQueue = new Map();
        this.init();
    }

    init() {
        this.setupCache();
        this.setupRequestInterceptors();
    }

    setupCache() {
        // Cache configuration
        this.cacheConfig = {
            projects: { ttl: 5 * 60 * 1000 }, // 5 minutes
            github: { ttl: 10 * 60 * 1000 }, // 10 minutes
            auth: { ttl: 30 * 60 * 1000 }, // 30 minutes
            static: { ttl: 60 * 60 * 1000 }  // 1 hour
        };
        
        // Cache statistics
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0
        };
        
        // Start cleanup interval
        this.startCacheCleanup();
    }

    setupRequestInterceptors() {
        // Add request/response interceptors for logging and error handling
        this.originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const startTime = performance.now();
            
            try {
                const response = await this.originalFetch(...args);
                const endTime = performance.now();
                
                // Log API calls in development
                if (window.location.hostname === 'localhost') {
                    console.log(` API Call: ${args[0]} (${Math.round(endTime - startTime)}ms)`);
                }
                
                return response;
            } catch (error) {
                console.error(` API Error: ${args[0]}`, error);
                throw error;
            }
        };
    }

    // Generic API request method with caching
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
        
        // Check cache first
        if (options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                this.cacheStats.hits++;
                return cached;
            }
        }
        this.cacheStats.misses++;

        // Prevent duplicate requests
        if (this.requestQueue.has(cacheKey)) {
            return this.requestQueue.get(cacheKey);
        }

        const requestPromise = this.makeRequest(url, options);
        this.requestQueue.set(cacheKey, requestPromise);

        try {
            const response = await requestPromise;
            
            // Cache successful GET requests
            if (response.ok && (!options.method || options.method === 'GET')) {
                try {
                    const data = await response.clone().json();
                    this.setCache(cacheKey, data, endpoint);
                    this.cacheStats.sets++;
                } catch (error) {
                    console.warn('Failed to parse JSON for caching:', error);
                    // Continue without caching if JSON parsing fails
                }
            }
            
            return response;
        } finally {
            this.requestQueue.delete(cacheKey);
        }
    }

    async makeRequest(url, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            credentials: 'include',
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(url, finalOptions);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new ApiError(error.message || `HTTP ${response.status}`, response.status, error);
        }

        return response;
    }

    // Projects API
    async getProjects(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = `/projects${queryString ? '?' + queryString : ''}`;
        
        const response = await this.request(endpoint);
        return response.json();
    }

    async getProject(id) {
        const response = await this.request(`/projects/${id}`);
        return response.json();
    }

    async createProject(projectData) {
        const response = await this.request('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        return response.json();
    }

    async updateProject(id, projectData) {
        const response = await this.request(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
        return response.json();
    }

    async deleteProject(id) {
        const response = await this.request(`/projects/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    }

    // GitHub API
    async getGitHubRepos(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = `/github/repos${queryString ? '?' + queryString : ''}`;
        
        const response = await this.request(endpoint);
        return response.json();
    }

    async syncGitHubRepos() {
        const response = await this.request('/github/sync', {
            method: 'POST'
        });
        return response.json();
    }

    // Authentication API
    async login(credentials) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        return response.json();
    }

    async logout() {
        const response = await this.request('/auth/logout', {
            method: 'POST'
        });
        return response.json();
    }

    async getProfile() {
        const response = await this.request('/auth/profile');
        return response.json();
    }

    // Utility methods
    getAuthToken() {
        // Tokens are now stored in httpOnly cookies
        return null;
    }

    setAuthToken(token) {
        // Tokens are now stored in httpOnly cookies
        console.warn('setAuthToken is deprecated - tokens are now stored in httpOnly cookies');
    }

    removeAuthToken() {
        // Tokens are now stored in httpOnly cookies
        console.warn('removeAuthToken is deprecated - tokens are now stored in httpOnly cookies');
    }

    // Cache management
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
            return Promise.resolve(cached.data);
        }
        if (cached) {
            this.cacheStats.evictions++;
        }
        this.cache.delete(key);
        return null;
    }

    setCache(key, data, endpoint) {
        let ttl = this.cacheConfig.static.ttl; // default TTL
        
        // Determine TTL based on endpoint
        if (endpoint.includes('/projects')) {
            ttl = this.cacheConfig.projects.ttl;
        } else if (endpoint.includes('/github')) {
            ttl = this.cacheConfig.github.ttl;
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    clearCache() {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`Cache cleared: ${size} entries removed`);
    }
    
    // Get cache statistics
    getCacheStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;
            
        return {
            ...this.cacheStats,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            memoryUsage: this.estimateMemoryUsage()
        };
    }
    
    // Estimate memory usage
    estimateMemoryUsage() {
        let totalSize = 0;
        for (const [key, item] of this.cache.entries()) {
            totalSize += key.length * 2; // String size
            totalSize += JSON.stringify(item.data).length * 2;
            totalSize += 100; // Metadata overhead
        }
        return `${(totalSize / 1024).toFixed(2)} KB`;
    }
    
    // Start cache cleanup
    startCacheCleanup() {
        setInterval(() => {
            this.cleanupExpired();
        }, 5 * 60 * 1000); // Every 5 minutes
    }
    
    // Cleanup expired items
    cleanupExpired() {
        const now = Date.now();
        let deletedCount = 0;
        
        for (const [key, item] of this.cache.entries()) {
            if (now > item.timestamp + item.ttl) {
                this.cache.delete(key);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            this.cacheStats.evictions += deletedCount;
            console.log(`Cache cleanup: ${deletedCount} expired entries removed`);
        }
    }

    // Batch requests
    async batchRequests(requests) {
        const promises = requests.map(request => {
            const { endpoint, options } = request;
            return this.request(endpoint, options);
        });

        return Promise.allSettled(promises);
    }

    // Retry mechanism
    async requestWithRetry(endpoint, options = {}, maxRetries = 3) {
        let lastError;
        
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await this.request(endpoint, options);
            } catch (error) {
                lastError = error;
                
                // Don't retry on client errors (4xx)
                if (error.status >= 400 && error.status < 500) {
                    throw error;
                }
                
                // Exponential backoff
                if (i < maxRetries) {
                    const delay = Math.pow(2, i) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    // Request cancellation
    createCancellableRequest(endpoint, options = {}) {
        const controller = new AbortController();
        
        const requestPromise = this.request(endpoint, {
            ...options,
            signal: controller.signal
        });

        return {
            request: requestPromise,
            cancel: () => controller.abort()
        };
    }
}

// Custom error class for API errors
class ApiError extends Error {
    constructor(message, status, details) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

// Initialize API module
const apiModule = new ApiModule();

// Export for use in other modules
window.apiModule = apiModule;
window.ApiError = ApiError;