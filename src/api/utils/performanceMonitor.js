const { logger } = require('./logger');
const { cache } = require('./cache');

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            queries: new Map(),
            cache: new Map(),
            requests: new Map(),
            slowQueries: [],
            memoryUsage: []
        };
        
        this.thresholds = {
            slowQuery: 1000, // 1 second
            slowRequest: 2000, // 2 seconds
            memoryAlert: 100 * 1024 * 1024 // 100MB
        };
        
        this.startMonitoring();
    }

    // Start periodic monitoring
    startMonitoring() {
        // Monitor memory usage every minute
        setInterval(() => {
            this.recordMemoryUsage();
        }, 60000);
        
        // Clean up old metrics every hour
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 3600000);
    }

    // Record query performance
    recordQuery(query, duration, params = {}) {
        const queryHash = this.hashQuery(query);
        const existing = this.metrics.queries.get(queryHash) || {
            query,
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            maxDuration: 0,
            minDuration: Infinity,
            params: new Set()
        };
        
        existing.count++;
        existing.totalDuration += duration;
        existing.avgDuration = existing.totalDuration / existing.count;
        existing.maxDuration = Math.max(existing.maxDuration, duration);
        existing.minDuration = Math.min(existing.minDuration, duration);
        
        // Store parameter types (not values for security)
        if (params && Array.isArray(params)) {
            existing.params.add(params.map(p => typeof p).join(','));
        }
        
        this.metrics.queries.set(queryHash, existing);
        
        // Track slow queries
        if (duration > this.thresholds.slowQuery) {
            this.metrics.slowQueries.push({
                query,
                duration,
                timestamp: new Date().toISOString(),
                params: params ? params.length : 0
            });
            
            // Keep only last 100 slow queries
            if (this.metrics.slowQueries.length > 100) {
                this.metrics.slowQueries.shift();
            }
            
            logger.warn('Slow query detected', null, {
                query: query.substring(0, 200),
                duration,
                threshold: this.thresholds.slowQuery
            });
        }
        
        return existing;
    }

    // Record cache performance
    recordCacheOperation(operation, key, hit = null) {
        const existing = this.metrics.cache.get(operation) || {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            totalOperations: 0
        };
        
        existing.totalOperations++;
        
        switch (operation) {
            case 'get':
                if (hit !== null) {
                    if (hit) existing.hits++;
                    else existing.misses++;
                }
                break;
            case 'set':
                existing.sets++;
                break;
            case 'delete':
                existing.deletes++;
                break;
        }
        
        this.metrics.cache.set(operation, existing);
        return existing;
    }

    // Record request performance
    recordRequest(req, duration, statusCode) {
        const route = req.route ? req.route.path : req.originalUrl;
        const method = req.method;
        const key = `${method}:${route}`;
        
        const existing = this.metrics.requests.get(key) || {
            method,
            route,
            count: 0,
            totalDuration: 0,
            avgDuration: 0,
            maxDuration: 0,
            minDuration: Infinity,
            statusCodes: new Map()
        };
        
        existing.count++;
        existing.totalDuration += duration;
        existing.avgDuration = existing.totalDuration / existing.count;
        existing.maxDuration = Math.max(existing.maxDuration, duration);
        existing.minDuration = Math.min(existing.minDuration, duration);
        
        // Track status codes
        const statusCount = existing.statusCodes.get(statusCode) || 0;
        existing.statusCodes.set(statusCode, statusCount + 1);
        
        this.metrics.requests.set(key, existing);
        
        // Track slow requests
        if (duration > this.thresholds.slowRequest) {
            logger.warn('Slow request detected', null, {
                method,
                route,
                duration,
                statusCode,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });
        }
        
        return existing;
    }

    // Record memory usage
    recordMemoryUsage() {
        const usage = process.memoryUsage();
        const timestamp = Date.now();
        
        this.metrics.memoryUsage.push({
            timestamp,
            rss: usage.rss,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external
        });
        
        // Keep only last hour of data
        const oneHourAgo = timestamp - 3600000;
        this.metrics.memoryUsage = this.metrics.memoryUsage.filter(
            entry => entry.timestamp > oneHourAgo
        );
        
        // Alert on high memory usage
        if (usage.heapUsed > this.thresholds.memoryAlert) {
            logger.warn('High memory usage detected', null, {
                heapUsed: usage.heapUsed,
                threshold: this.thresholds.memoryAlert,
                rss: usage.rss
            });
        }
    }

    // Hash query for grouping
    hashQuery(query) {
        // Remove parameters and whitespace for consistent hashing
        const normalized = query
            .replace(/\s+/g, ' ')
            .replace(/\?+/g, '?')
            .trim();
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    // Get performance summary
    getSummary() {
        const cacheStats = cache.getStats();
        
        return {
            queries: {
                total: this.metrics.queries.size,
                slowQueries: this.metrics.slowQueries.length,
                topSlowQueries: this.metrics.slowQueries.slice(0, 10),
                avgQueryTime: this.calculateAverageQueryTime()
            },
            cache: cacheStats,
            requests: {
                total: this.metrics.requests.size,
                slowRequests: this.countSlowRequests(),
                topSlowRequests: this.getTopSlowRequests()
            },
            memory: {
                current: process.memoryUsage(),
                trend: this.getMemoryTrend(),
                alerts: this.getMemoryAlerts()
            },
            timestamp: new Date().toISOString()
        };
    }

    // Calculate average query time
    calculateAverageQueryTime() {
        let totalDuration = 0;
        let totalCount = 0;
        
        for (const query of this.metrics.queries.values()) {
            totalDuration += query.totalDuration;
            totalCount += query.count;
        }
        
        return totalCount > 0 ? totalDuration / totalCount : 0;
    }

    // Count slow requests
    countSlowRequests() {
        let count = 0;
        for (const request of this.metrics.requests.values()) {
            if (request.avgDuration > this.thresholds.slowRequest) {
                count++;
            }
        }
        return count;
    }

    // Get top slow requests
    getTopSlowRequests() {
        const requests = Array.from(this.metrics.requests.values());
        return requests
            .sort((a, b) => b.avgDuration - a.avgDuration)
            .slice(0, 10)
            .map(r => ({
                route: r.route,
                method: r.method,
                avgDuration: r.avgDuration,
                maxDuration: r.maxDuration,
                count: r.count
            }));
    }

    // Get memory trend
    getMemoryTrend() {
        if (this.metrics.memoryUsage.length < 2) {
            return 'insufficient_data';
        }
        
        const recent = this.metrics.memoryUsage.slice(-10);
        const older = this.metrics.memoryUsage.slice(-20, -10);
        
        if (older.length === 0) return 'insufficient_data';
        
        const recentAvg = recent.reduce((sum, entry) => sum + entry.heapUsed, 0) / recent.length;
        const olderAvg = older.reduce((sum, entry) => sum + entry.heapUsed, 0) / older.length;
        
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    // Get memory alerts
    getMemoryAlerts() {
        const current = process.memoryUsage();
        const alerts = [];
        
        if (current.heapUsed > this.thresholds.memoryAlert) {
            alerts.push({
                type: 'high_memory',
                value: current.heapUsed,
                threshold: this.thresholds.memoryAlert
            });
        }
        
        const trend = this.getMemoryTrend();
        if (trend === 'increasing') {
            alerts.push({
                type: 'memory_trend',
                trend: 'increasing'
            });
        }
        
        return alerts;
    }

    // Clean up old metrics
    cleanupOldMetrics() {
        const oneDayAgo = Date.now() - 86400000;
        
        // Clean old slow queries
        this.metrics.slowQueries = this.metrics.slowQueries.filter(
            query => new Date(query.timestamp).getTime() > oneDayAgo
        );
        
        logger.debug('Performance metrics cleanup completed', null, {
            queriesKept: this.metrics.queries.size,
            slowQueriesKept: this.metrics.slowQueries.length,
            memoryDataPoints: this.metrics.memoryUsage.length
        });
    }

    // Reset all metrics
    reset() {
        this.metrics = {
            queries: new Map(),
            cache: new Map(),
            requests: new Map(),
            slowQueries: [],
            memoryUsage: []
        };
        
        logger.info('Performance metrics reset', null, {});
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Express middleware for request monitoring
function requestMonitor(req, res, next) {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        performanceMonitor.recordRequest(req, duration, res.statusCode);
    });
    
    next();
}

// Database query monitoring wrapper
function monitorQuery(db) {
    const originalExecute = db.execute;
    
    db.execute = async function(query, params) {
        const startTime = Date.now();
        
        try {
            const result = await originalExecute.call(this, query, params);
            const duration = Date.now() - startTime;
            
            performanceMonitor.recordQuery(query, duration, params);
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            performanceMonitor.recordQuery(query, duration, params);
            
            throw error;
        }
    };
    
    return db;
}

module.exports = {
    PerformanceMonitor,
    performanceMonitor,
    requestMonitor,
    monitorQuery
};