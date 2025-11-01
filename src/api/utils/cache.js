const { logger } = require('./logger');

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        
        // Cache configuration
        this.config = {
            projects: {
                ttl: 5 * 60 * 1000, // 5 minutes
                maxSize: 1000
            },
            github: {
                ttl: 15 * 60 * 1000, // 15 minutes
                maxSize: 500
            },
            user: {
                ttl: 10 * 60 * 1000, // 10 minutes
                maxSize: 200
            },
            auth: {
                ttl: 30 * 60 * 1000, // 30 minutes
                maxSize: 100
            }
        };
        
        // Start cleanup interval
        this.startCleanup();
    }

    // Generate cache key
    generateKey(prefix, params = {}) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}:${params[key]}`)
            .join('|');
        return `${prefix}:${sortedParams}`;
    }

    // Get value from cache
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            this.cacheStats.misses++;
            return null;
        }
        
        // Check if expired
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            this.cacheStats.misses++;
            this.cacheStats.evictions++;
            return null;
        }
        
        // Update access time for LRU
        item.lastAccessed = Date.now();
        this.cacheStats.hits++;
        
        logger.debug('Cache hit', null, { key, ttl: item.expiresAt - Date.now() });
        return item.data;
    }

    // Set value in cache
    set(key, data, category = 'projects') {
        const categoryConfig = this.config[category] || this.config.projects;
        
        // Check size limit and evict if necessary
        if (this.cache.size >= categoryConfig.maxSize) {
            this.evictLRU(category);
        }
        
        const item = {
            data,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            expiresAt: Date.now() + categoryConfig.ttl,
            category
        };
        
        this.cache.set(key, item);
        this.cacheStats.sets++;
        
        logger.debug('Cache set', null, { key, category, ttl: categoryConfig.ttl });
    }

    // Delete from cache
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.cacheStats.deletes++;
            logger.debug('Cache delete', null, { key });
        }
        return deleted;
    }

    // Clear cache by category or all
    clear(category = null) {
        if (category) {
            let deletedCount = 0;
            for (const [key, item] of this.cache.entries()) {
                if (item.category === category) {
                    this.cache.delete(key);
                    deletedCount++;
                }
            }
            logger.info('Cache cleared by category', null, { category, deletedCount });
        } else {
            const size = this.cache.size;
            this.cache.clear();
            logger.info('Cache cleared', null, { previousSize: size });
        }
    }

    // Invalidate cache by pattern (with safe regex handling)
    invalidatePattern(pattern) {
        let deletedCount = 0;
        
        // Validate and sanitize pattern to prevent ReDoS attacks
        if (!pattern || typeof pattern !== 'string') {
            logger.warn('Invalid pattern provided to invalidatePattern', null, { pattern });
            return 0;
        }
        
        // Limit pattern length and complexity
        if (pattern.length > 100) {
            logger.warn('Pattern too long for invalidatePattern', null, { patternLength: pattern.length });
            return 0;
        }
        
        // Only allow simple glob-like patterns for safety
        // First escape all regex metacharacters except glob characters
        let safePattern = pattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape all regex metacharacters
            .replace(/\\\*/g, '.*')  // Convert escaped * to .*
            .replace(/\\\?/g, '.');  // Convert escaped ? to .
        
        // Block potentially dangerous regex patterns
        const dangerousPatterns = [
            /\(\?\=.*\)/,         // Any lookahead
            /\(\?\!.*\)/,         // Any negative lookahead
            /\(\?\:.*\)/,         // Non-capturing groups
            /\{.*\}/,             // Quantifiers with specific counts
            /\+/,                 // One or more quantifier
            /\[\^.*?\]/,          // Negated character classes
            /\\[bBdDsSwW]/,       // Special character classes
            /\\[nrtvf]/,          // Escape sequences
            /\(\.\*\)/,           // Groups with quantifiers
            /\.\*\.\*/,           // Multiple wildcards
            /\.\*\+/,             // Greedy quantifiers
            /\.\*\?/,             // Lazy quantifiers
        ];
        
        for (const dangerousPattern of dangerousPatterns) {
            if (dangerousPattern.test(pattern)) {
                logger.warn('Dangerous regex pattern blocked', null, { pattern });
                return 0;
            }
        }
        
        // Additional validation: only allow alphanumeric, spaces, and simple glob characters
        if (!/^[a-zA-Z0-9_\-\s\*\?\:|\.]+$/.test(pattern)) {
            logger.warn('Pattern contains invalid characters', null, { pattern });
            return 0;
        }
        
        try {
            // Create safe regex with anchored pattern
            const regex = new RegExp(`^${safePattern}$`);
            const startTime = Date.now();
            const timeout = 2000; // Reduced timeout to 2 seconds
            const maxKeys = 1000; // Limit number of keys to process
            
            let processedKeys = 0;
            for (const [key] of this.cache.entries()) {
                processedKeys++;
                
                // Check timeout
                if (Date.now() - startTime > timeout) {
                    logger.warn('Regex pattern matching timed out', null, { 
                        pattern, 
                        processedKeys, 
                        deletedCount 
                    });
                    break;
                }
                
                // Limit processing to prevent DoS
                if (processedKeys > maxKeys) {
                    logger.warn('Pattern matching exceeded maximum key limit', null, { 
                        pattern, 
                        maxKeys,
                        deletedCount 
                    });
                    break;
                }
                
                if (regex.test(key)) {
                    this.cache.delete(key);
                    deletedCount++;
                }
            }
            
            logger.info('Cache invalidated by pattern', null, { 
                pattern, 
                deletedCount,
                processedKeys 
            });
            return deletedCount;
            
        } catch (error) {
            logger.error('Invalid regex pattern in invalidatePattern', null, { 
                pattern, 
                error: error.message 
            });
            return 0;
        }
    }

    // Evict least recently used items
    evictLRU(category) {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, item] of this.cache.entries()) {
            if (item.category === category && item.lastAccessed < oldestTime) {
                oldestTime = item.lastAccessed;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.cacheStats.evictions++;
            logger.debug('LRU eviction', null, { key: oldestKey, category });
        }
    }

    // Cleanup expired items
    cleanup() {
        const now = Date.now();
        let deletedCount = 0;
        
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            this.cacheStats.evictions += deletedCount;
            logger.debug('Cache cleanup completed', null, { deletedCount });
        }
        
        return deletedCount;
    }

    // Start periodic cleanup
    startCleanup() {
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    // Get cache statistics
    getStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;
            
        return {
            ...this.cacheStats,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            memoryUsage: this.getMemoryUsage()
        };
    }

    // Estimate memory usage
    getMemoryUsage() {
        let totalSize = 0;
        for (const [key, item] of this.cache.entries()) {
            totalSize += key.length * 2; // String size
            totalSize += JSON.stringify(item.data).length * 2;
            totalSize += 100; // Metadata overhead
        }
        return `${(totalSize / 1024 / 1024).toFixed(2)} MB`;
    }

    // Cache middleware for Express
    middleware(category = 'projects', keyGenerator = null) {
        return (req, res, next) => {
            const key = keyGenerator 
                ? keyGenerator(req)
                : this.generateKey(category, { 
                    url: req.originalUrl, 
                    query: req.query,
                    user: req.user?.userId 
                });
            
            const cached = this.get(key);
            if (cached) {
                res.set('X-Cache', 'HIT');
                return res.json(cached);
            }
            
            // Store original res.json
            const originalJson = res.json;
            res.json = (data) => {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    this.set(key, data, category);
                }
                res.set('X-Cache', 'MISS');
                return originalJson.call(res, data);
            };
            
            next();
        };
    }
}

// Create singleton instance
const cacheManager = new CacheManager();

module.exports = {
    CacheManager,
    cache: cacheManager
};