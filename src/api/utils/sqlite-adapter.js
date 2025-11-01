const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logger } = require('./logger');

// Sanitize parameters for logging to prevent leaking sensitive data
function sanitizeParamsForLogging(params) {
    if (!Array.isArray(params)) return params;
    
    const sensitivePatterns = [
        /password/i,
        /token/i,
        /hash/i,
        /secret/i,
        /key/i,
        /auth/i,
        /credential/i,
        /private/i,
        /bearer/i,
        /jwt/i,
        /session/i,
        /csrf/i,
        /nonce/i
    ];
    
    return params.map((param, index) => {
        if (typeof param === 'string') {
            // Check if parameter might be sensitive based on common patterns
            const isSensitive = sensitivePatterns.some(pattern => pattern.test(param));
            
            // Check for various sensitive data patterns
            const looksLikeSecret = 
                // Base64 encoded data (typically long strings with = padding)
                /^[A-Za-z0-9+/]{20,}={0,2}$/.test(param) ||
                // Hex encoded data (long hex strings)
                /^[a-fA-F0-9]{32,}$/.test(param) ||
                // JWT tokens (three parts separated by dots)
                /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(param) ||
                // Bearer tokens
                /^bearer\s+[A-Za-z0-9._-]+$/i.test(param) ||
                // API keys (alphanumeric with special chars, typically 20+ chars)
                /^[A-Za-z0-9_\-]{20,}$/.test(param) ||
                // UUIDs
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(param) ||
                // Long random-looking strings (high entropy)
                (param.length > 16 && calculateEntropy(param) > 3.5) ||
                // Very long strings (likely encoded data)
                param.length > 200;
            
            if (isSensitive || looksLikeSecret) {
                return '[REDACTED]';
            }
        } else if (typeof param === 'object' && param !== null) {
            // Recursively sanitize objects
            return sanitizeObjectForLogging(param);
        }
        return param;
    });
}

// Calculate string entropy to detect random-looking data
function calculateEntropy(str) {
    const freq = {};
    for (let i = 0; i < str.length; i++) {
        freq[str[i]] = (freq[str[i]] || 0) + 1;
    }
    
    let entropy = 0;
    for (const char in freq) {
        const p = freq[char] / str.length;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

// Recursively sanitize objects
function sanitizeObjectForLogging(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObjectForLogging(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sensitiveKeyPatterns = [
                /password/i,
                /token/i,
                /hash/i,
                /secret/i,
                /key/i,
                /auth/i,
                /credential/i,
                /private/i,
                /bearer/i,
                /jwt/i,
                /session/i,
                /csrf/i,
                /nonce/i
            ];
            
            const isSensitiveKey = sensitiveKeyPatterns.some(pattern => pattern.test(key));
            
            if (isSensitiveKey) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'string') {
                // Apply the same string checks as in the main function
                const looksLikeSecret = 
                    /^[A-Za-z0-9+/]{20,}={0,2}$/.test(value) ||
                    /^[a-fA-F0-9]{32,}$/.test(value) ||
                    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ||
                    /^bearer\s+[A-Za-z0-9._-]+$/i.test(value) ||
                    /^[A-Za-z0-9_\-]{20,}$/.test(value) ||
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
                    (value.length > 16 && calculateEntropy(value) > 3.5) ||
                    value.length > 200;
                
                sanitized[key] = looksLikeSecret ? '[REDACTED]' : value;
            } else {
                sanitized[key] = sanitizeObjectForLogging(value);
            }
        }
        return sanitized;
    }
    
    return obj;
}

class SQLiteAdapter {
    constructor(dbPath = 'portfolio.db') {
        // If dbPath is just a filename, look for it in /app directory
        if (!path.isAbsolute(dbPath) && !dbPath.includes('/')) {
            this.dbPath = path.join('/app', dbPath);
        } else {
            this.dbPath = path.resolve(__dirname, '../../..', dbPath);
        }
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    logger.error('SQLite connection failed', err);
                    reject(err);
                } else {
                    logger.info('SQLite connection established', null, {
                        database: this.dbPath
                    });
                    // Enable foreign keys
                    this.db.run('PRAGMA foreign_keys = ON');
                    resolve();
                }
            });
        });
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            logger.info('SQLite query executing', null, { sql, params: sanitizeParamsForLogging(params) });
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('SQLite query failed', err, { sql, params: sanitizeParamsForLogging(params) });
                    reject(err);
                } else {
                    logger.info('SQLite query success', null, { rowCount: rows.length });
                    resolve(rows);
                }
            });
        });
    }

    async execute(sql, params = []) {
        return new Promise((resolve, reject) => {
            // Check if it's a SELECT query
            const trimmedSql = sql.trim().toUpperCase();
            if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
                // For SELECT queries, use all() to return rows
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        logger.error('SQLite execute failed', err, { sql, params: sanitizeParamsForLogging(params) });
                        reject(err);
                    } else {
                        resolve([rows]); // Return as array to match MySQL format
                    }
                });
            } else {
                // For INSERT/UPDATE/DELETE queries, use run()
                this.db.run(sql, params, function(err) {
                    if (err) {
                        logger.error('SQLite execute failed', err, { sql, params: sanitizeParamsForLogging(params) });
                        reject(err);
                    } else {
                        resolve([{
                            insertId: this.lastID, 
                            affectedRows: this.changes,
                            changedRows: this.changes 
                        }]);
                    }
                });
            }
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        logger.info('SQLite connection closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // MySQL compatibility methods
    async getConnection() {
        return this;
    }

    async release() {
        // No-op for SQLite
    }

    async beginTransaction() {
        return this.execute('BEGIN TRANSACTION');
    }

    async commit() {
        return this.execute('COMMIT');
    }

    async rollback() {
        return this.execute('ROLLBACK');
    }
}

// Create a pool-like interface for compatibility
class SQLitePool {
    constructor(config) {
        const dbPath = config.database || config.name || 'portfolio.db';
        this.adapter = new SQLiteAdapter(dbPath);
        this.connected = false;
    }

    async getConnection() {
        if (!this.connected) {
            await this.adapter.connect();
            this.connected = true;
        }
        return this.adapter;
    }

    on(event, callback) {
        // Basic event handling for compatibility
        if (event === 'connection') {
            // Simulate connection event
            setTimeout(() => callback({ threadId: 1 }), 0);
        }
    }

    async end() {
        return this.adapter.close();
    }
}

module.exports = {
    SQLiteAdapter,
    SQLitePool,
    createPool: (config) => new SQLitePool(config.database || 'portfolio.db')
};