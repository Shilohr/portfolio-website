const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

// Simple mutex for preventing concurrent writes
class WriteMutex {
    constructor() {
        this.locked = false;
        this.queue = [];
    }
    
    async acquire() {
        return new Promise((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
    
    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        } else {
            this.locked = false;
        }
    }
}

// Sanitize parameters for logging to prevent leaking sensitive data
function sanitizeParamsForLogging(params) {
    if (!Array.isArray(params)) return params;
    
    const sensitivePatterns = [
        /password/i,
        /token/i,
        /hash/i,
        /secret/i,
        /key/i,
        /auth/i
    ];
    
    return params.map((param, index) => {
        if (typeof param === 'string') {
            // Check if parameter might be sensitive based on common patterns
            const isSensitive = sensitivePatterns.some(pattern => pattern.test(param));
            if (isSensitive || param.length > 100) {
                return '[REDACTED]';
            }
        }
        return param;
    });
}

class JSONAdapter {
    constructor(dbPath = 'portfolio.json') {
        // If dbPath is just a filename, look for it in /app directory
        if (!path.isAbsolute(dbPath) && !dbPath.includes('/')) {
            this.dbPath = path.join('/app', dbPath);
        } else {
            this.dbPath = path.resolve(__dirname, '../../..', dbPath);
        }
        this.data = null;
        this.initialized = false;
        this.writeMutex = new WriteMutex();
        this.transactionInProgress = false;
        this.transactionData = null;
    }

    async connect() {
        try {
            // Initialize database structure if it doesn't exist
            await this.initializeDatabase();
            logger.info('JSON database connection established', null, {
                database: this.dbPath
            });
        } catch (err) {
            logger.error('JSON database connection failed', err);
            throw err;
        }
    }

    async initializeDatabase() {
        try {
            // Try to read existing data
            const data = await fs.readFile(this.dbPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                // Create initial database structure
                this.data = {
                    projects: [],
                    users: [],
                    sessions: [],
                    audit_log: [],
                    github_cache: {},
                    github_repos: []
                };
                await this.save();
            } else {
                throw err;
            }
        }
        this.initialized = true;
    }

async save() {
        // Don't save if transaction is in progress (will be saved on commit)
        if (this.transactionInProgress) {
            return;
        }
        
        // Use mutex to prevent concurrent writes
        await this.writeMutex.acquire();
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (error) {
            logger.error('Failed to save JSON database', null, { 
                error: error.message,
                dbPath: this.dbPath
            });
            throw error;
        } finally {
            this.writeMutex.release();
        }
    }
        
        // Serialize writes to prevent race conditions
        if (this.writeLock) {
            return new Promise((resolve, reject) => {
                this.writeQueue.push({ resolve, reject });
            });
        }

        this.writeLock = true;
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
            
            // Resolve any queued writes
            while (this.writeQueue.length > 0) {
                const { resolve } = this.writeQueue.shift();
                resolve();
            }
        } catch (error) {
            logger.error('Failed to save JSON database', null, { 
                error: error.message,
                dbPath: this.dbPath
            });
            
            // Reject any queued writes
            while (this.writeQueue.length > 0) {
                const { reject } = this.writeQueue.shift();
                reject(error);
            }
            
            throw error;
        } finally {
            this.writeLock = false;
        }
    }

    async query(sql, params = []) {
        await this.ensureInitialized();
        logger.info('JSON query executing', null, { sql, params: sanitizeParamsForLogging(params) });
        
        // Parse SQL and convert to JSON operations
        const result = this.executeSQL(sql, params);
        
        logger.info('JSON query success', null, { rowCount: result.length });
        return result;
    }

    async execute(sql, params = []) {
        await this.ensureInitialized();
        
        // Check if it's a SELECT query
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
            // For SELECT queries, return rows
            const rows = this.executeSQL(sql, params);
            return [rows]; // Return as array to match MySQL format
        } else {
            // For INSERT/UPDATE/DELETE queries, execute and return result
            const result = this.executeSQL(sql, params);
            return [{
                insertId: result.insertId || 0, 
                affectedRows: result.affectedRows || 0,
                changedRows: result.changedRows || 0
            }];
        }
    }

    executeSQL(sql, params) {
        const trimmedSql = sql.trim().toUpperCase();
        
        // Simple SQL parser for basic operations
        if (trimmedSql.startsWith('SELECT')) {
            return this.executeSelect(sql, params);
        } else if (trimmedSql.startsWith('INSERT')) {
            return await this.executeInsert(sql, params);
        } else if (trimmedSql.startsWith('UPDATE')) {
            return await this.executeUpdate(sql, params);
        } else if (trimmedSql.startsWith('DELETE')) {
            return await this.executeDelete(sql, params);
        } else if (trimmedSql.startsWith('CREATE')) {
            return this.executeCreate(sql, params);
        } else {
            throw new Error(`Unsupported SQL operation: ${sql}`);
        }
    }

    executeSelect(sql, params) {
        // Handle special case for health check query
        if (sql.includes('SELECT 1 as test')) {
            return [{ test: 1 }];
        }
        
        // Handle COUNT queries
        if (sql.includes('COUNT(*)')) {
            const tableMatch = sql.match(/FROM\s+(\w+)/i);
            if (!tableMatch) return [{ total: 0 }];
            
            let tableName = tableMatch[1].toLowerCase();
            // Map user_sessions to sessions for JSON adapter
            if (tableName === 'user_sessions') {
                tableName = 'sessions';
            }
            let data = this.data[tableName] || [];
            
            // Apply WHERE conditions for COUNT
            const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
            if (whereMatch) {
                const whereClause = whereMatch[1];
                data = this.applyWhereClause(data, whereClause, params);
            }
            
            return [{ total: data.length }];
        }
        
        // Simple SELECT parser - handles basic queries
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (!tableMatch) return [];
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        let data = this.data[tableName] || [];
        
        // Apply WHERE conditions (basic implementation)
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1];
            data = this.applyWhereClause(data, whereClause, params);
        }
        
        // Apply ORDER BY
        const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
        if (orderMatch) {
            const orderClause = orderMatch[1];
            data = this.applyOrderBy(data, orderClause);
        }
        
        // Apply LIMIT
        const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            const limit = parseInt(limitMatch[1]);
            data = data.slice(0, limit);
        }
        
        return data;
    }

    async executeInsert(sql, params) {
        const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        if (!this.data[tableName]) {
            this.data[tableName] = [];
        }
        
        // Simple INSERT implementation
        const newRecord = {};
        if (params && params.length > 0) {
            // Use parameters to create record
            const columnsMatch = sql.match(/\(([^)]+)\)/);
            if (columnsMatch) {
                const columns = columnsMatch[1].split(',').map(c => c.trim());
                columns.forEach((col, index) => {
                    newRecord[col] = params[index];
                });
            }
        }
        
        // Add auto-increment ID if not present
        if (!newRecord.id) {
            const maxId = this.data[tableName].reduce((max, record) => 
                Math.max(max, record.id || 0), 0);
            newRecord.id = maxId + 1;
        }
        
        this.data[tableName].push(newRecord);
        
        // Only save immediately if not in a transaction
        if (!this.transactionInProgress) {
            try {
                await this.save();
            } catch (error) {
                // Rollback the insert if save failed
                const index = this.data[tableName].findIndex(r => r.id === newRecord.id);
                if (index !== -1) {
                    this.data[tableName].splice(index, 1);
                }
                throw error;
            }
        }
        
        return { 
            insertId: newRecord.id, 
            affectedRows: 1 
        };
    }

    async executeUpdate(sql, params) {
        const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        let data = this.data[tableName] || [];
        
        // Apply WHERE conditions
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+LIMIT|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1];
            data = this.applyWhereClause(data, whereClause, params);
        }
        
        // Apply SET operations (simplified)
        const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
        if (setMatch && params.length > 0) {
            const setClause = setMatch[1];
            const updates = this.parseSetClause(setClause, params);
            
            // Store original state for rollback
            const originalStates = [];
            let affectedRows = 0;
            
            data.forEach(record => {
                const originalData = this.data[tableName].find(r => r.id === record.id);
                if (originalData) {
                    originalStates.push({
                        id: originalData.id,
                        data: { ...originalData }
                    });
                    Object.assign(originalData, updates);
                    affectedRows++;
                }
            });
            
            // Only save immediately if not in a transaction
            if (!this.transactionInProgress) {
                try {
                    await this.save();
                } catch (error) {
                    // Rollback updates if save failed
                    originalStates.forEach(({ id, data: originalData }) => {
                        const index = this.data[tableName].findIndex(r => r.id === id);
                        if (index !== -1) {
                            this.data[tableName][index] = originalData;
                        }
                    });
                    throw error;
                }
            }
            
            return { affectedRows };
        }
        
        return { affectedRows: 0 };
    }

    async executeDelete(sql, params) {
        const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        let data = this.data[tableName] || [];
        
        // Apply WHERE conditions
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+LIMIT|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1];
            const toDelete = this.applyWhereClause([...data], whereClause, params);
            
            // Store original data for rollback
            const originalData = [...this.data[tableName]];
            
            // Remove records
            this.data[tableName] = data.filter(record => 
                !toDelete.some(deleteRecord => deleteRecord.id === record.id)
            );
            
            // Only save immediately if not in a transaction
            if (!this.transactionInProgress) {
                try {
                    await this.save();
                } catch (error) {
                    // Rollback deletion if save failed
                    this.data[tableName] = originalData;
                    throw error;
                }
            }
            
            return { affectedRows: toDelete.length };
        }
        
        return { affectedRows: 0 };
    }

    executeCreate(sql, params) {
        // Handle CREATE TABLE statements - no-op for JSON adapter
        logger.info('CREATE TABLE statement ignored in JSON adapter', null, { sql });
        return [];
    }

    applyWhereClause(data, whereClause, params) {
        // Check for unsupported SQL constructs that could cause issues
        const unsupportedPatterns = [
            /LIMIT\s+/i,
            /GROUP\s+BY/i,
            /HAVING\s+/i,
            /UNION/i,
            /JOIN/i,
            /SUBSTRING|LEFT|RIGHT|CONCAT|UPPER|LOWER/i,
            /\(.*SELECT.*\)/i,
            /IN\s*\(/i,
            /BETWEEN/i,
            /LIKE/i,
            /IS\s+(NULL|NOT\s+NULL)/i,
            /CASE\s+WHEN/i
        ];

        for (const pattern of unsupportedPatterns) {
            if (pattern.test(whereClause)) {
                throw new Error(`Unsupported SQL construct in WHERE clause: ${whereClause}`);
            }
        }

        // Validate parameter count matches placeholders
        const placeholderCount = (whereClause.match(/\?/g) || []).length;
        if (placeholderCount !== params.length) {
            throw new Error(`Parameter count mismatch. Expected ${placeholderCount}, got ${params.length}`);
        }

        return data.filter(record => {
            try {
                // Handle basic equality conditions with AND/OR
                const orConditions = whereClause.split('OR').map(c => c.trim());
                
                return orConditions.some(orCondition => {
                    const andConditions = orCondition.split('AND').map(c => c.trim());
                    return andConditions.every(andCondition => {
                        // Handle equality conditions
                        const match = andCondition.match(/(\w+)\s*=\s*\?/i);
                        if (match && params.length > 0) {
                            const column = match[1];
                            const paramIndex = this.getParamIndex(whereClause, andCondition);
                            if (paramIndex < 0 || paramIndex >= params.length) {
                                throw new Error(`Invalid parameter index for condition: ${andCondition}`);
                            }
                            return record[column] == params[paramIndex]; // Use == for loose comparison
                        }
                        
                        // Handle greater than conditions (for expires_at > NOW())
                        const greaterMatch = andCondition.match(/(\w+)\s*>\s*NOW\(\)/i);
                        if (greaterMatch) {
                            const column = greaterMatch[1];
                            const recordValue = record[column];
                            if (recordValue) {
                                const expiresTime = new Date(recordValue).getTime();
                                const nowTime = Date.now();
                                return expiresTime > nowTime;
                            }
                            return false;
                        }
                        
                        // Handle less than conditions (for expires_at < NOW())
                        const lessMatch = andCondition.match(/(\w+)\s*<\s*NOW\(\)/i);
                        if (lessMatch) {
                            const column = lessMatch[1];
                            const recordValue = record[column];
                            if (recordValue) {
                                const expiresTime = new Date(recordValue).getTime();
                                const nowTime = Date.now();
                                return expiresTime < nowTime;
                            }
                            return true; // If no expires_at, consider it expired
                        }
                        
                        // Handle boolean conditions (is_active = TRUE)
                        const booleanMatch = andCondition.match(/(\w+)\s*=\s*(TRUE|FALSE)/i);
                        if (booleanMatch) {
                            const column = booleanMatch[1];
                            const expectedValue = booleanMatch[2].toUpperCase() === 'TRUE';
                            const recordValue = record[column];
                            // If field doesn't exist, default to TRUE for is_active
                            if (recordValue === undefined && column === 'is_active') {
                                return expectedValue; // Assume active if not set
                            }
                            return recordValue === expectedValue;
                        }
                        
                        // If we can't parse the condition, fail closed
                        throw new Error(`Unsupported WHERE clause condition: ${andCondition}`);
                    });
                });
            } catch (error) {
                logger.error('WHERE clause parsing failed', null, { 
                    whereClause, 
                    params, 
                    error: error.message 
                });
                throw error;
            }
        });
    }
    
    getParamIndex(fullWhereClause, specificCondition) {
        // Find the parameter index for a specific condition within the full WHERE clause
        const conditions = fullWhereClause.split(/\s+(?:AND|OR)\s+/i);
        return conditions.findIndex(c => c.trim() === specificCondition.trim());
    }

    applyOrderBy(data, orderClause) {
        // Very basic ORDER BY implementation
        const match = orderClause.match(/(\w+)\s*(ASC|DESC)?/i);
        if (match) {
            const column = match[1];
            const direction = match[2] || 'ASC';
            
            return [...data].sort((a, b) => {
                const aVal = a[column];
                const bVal = b[column];
                
                if (direction.toUpperCase() === 'DESC') {
                    return bVal > aVal ? 1 : -1;
                } else {
                    return aVal > bVal ? 1 : -1;
                }
            });
        }
        return data;
    }

    parseSetClause(setClause, params) {
        // Very basic SET clause implementation
        const updates = {};
        const assignments = setClause.split(',');
        
        assignments.forEach((assignment, index) => {
            const match = assignment.match(/(\w+)\s*=\s*\?/i);
            if (match && params[index] !== undefined) {
                updates[match[1]] = params[index];
            }
        });
        
        return updates;
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.connect();
        }
    }

    async close() {
        // No-op for JSON adapter
        logger.info('JSON database connection closed');
    }

    // MySQL compatibility methods
    async getConnection() {
        return this;
    }

    async release() {
        // No-op for JSON adapter
    }

    async beginTransaction() {
        if (this.transactionInProgress) {
            throw new Error('Transaction already in progress');
        }
        
        // Create a deep copy of current data for rollback
        this.transactionData = JSON.parse(JSON.stringify(this.data));
        this.transactionInProgress = true;
        
        logger.debug('Transaction started', null, { 
            dbPath: this.dbPath,
            dataKeys: Object.keys(this.data)
        });
        
        return [];
    }

    async commit() {
        if (!this.transactionInProgress) {
            throw new Error('No transaction in progress');
        }
        
        try {
            // Save any pending changes
            await this.save();
            this.transactionData = null;
            this.transactionInProgress = false;
            
            logger.debug('Transaction committed', null, { 
                dbPath: this.dbPath
            });
            
            return [];
        } catch (error) {
            // If save fails, rollback automatically
            await this.rollback();
            throw error;
        }
    }

    async rollback() {
        if (!this.transactionInProgress) {
            logger.warn('Rollback called without active transaction', null);
            return [];
        }
        
        try {
            // Restore data from transaction snapshot
            if (this.transactionData) {
                this.data = this.transactionData;
                this.transactionData = null;
            }
            
            this.transactionInProgress = false;
            
            logger.debug('Transaction rolled back', null, { 
                dbPath: this.dbPath
            });
            
            return [];
        } catch (error) {
            logger.error('Error during transaction rollback', error, { 
                dbPath: this.dbPath
            });
            // Ensure transaction state is cleared even on error
            this.transactionInProgress = false;
            this.transactionData = null;
            throw error;
        }
    }
}

// Create a pool-like interface for compatibility
class JSONPool {
    constructor(config) {
        const dbPath = config.database || config.name || 'portfolio.json';
        this.adapter = new JSONAdapter(dbPath);
        this.connected = false;
        
        // Add MySQL-compatible pool properties for monitoring
        this._allConnections = [];
        this._freeConnections = [];
        this._connectionQueue = [];
        this.config = {
            connectionLimit: config.connectionLimit || 10
        };
    }

    async getConnection() {
        if (!this.connected) {
            await this.adapter.connect();
            this.connected = true;
        }
        return this.adapter;
    }

    async query(sql, params = []) {
        // Get a connection and delegate to the adapter's query method
        const connection = await this.getConnection();
        return await connection.query(sql, params);
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
    JSONAdapter,
    JSONPool,
    createPool: (config) => new JSONPool(config)
};