const fs = require('fs');
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
        // If dbPath is just a filename, determine the appropriate path
        if (!path.isAbsolute(dbPath) && !dbPath.includes('/')) {
            // Check if we're in production (Docker) by looking for /app directory
            if (fs.existsSync('/app')) {
                this.dbPath = path.join('/app', dbPath);
            } else {
                // Local development - use project root
                this.dbPath = path.resolve(__dirname, '../../..', dbPath);
            }
        } else {
            this.dbPath = path.resolve(__dirname, '../../..', dbPath);
        }
        this.data = null;
        this.initialized = false;
        this.writeMutex = new WriteMutex();
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
            const data = await fs.promises.readFile(this.dbPath, 'utf8');
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
        // Use mutex to prevent concurrent writes
        await this.writeMutex.acquire();
        try {
            await fs.promises.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
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

    async query(sql, params = []) {
        await this.ensureInitialized();
        logger.info('JSON query executing', null, { sql, params: sanitizeParamsForLogging(params) });
        
        // Parse SQL and convert to JSON operations
        const result = await this.executeSQL(sql, params, this._connectionContext);
        
        logger.info('JSON query success', null, { rowCount: result.length });
        return result;
    }

    async execute(sql, params = []) {
        await this.ensureInitialized();
        
        // Check if it's a SELECT query
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
            // For SELECT queries, return rows
            const rows = await this.executeSQL(sql, params, this._connectionContext);
            return [rows]; // Return as array to match MySQL format
        } else {
            // For INSERT/UPDATE/DELETE queries, execute and return result
            const result = await this.executeSQL(sql, params, this._connectionContext);
            return [{
                insertId: result.insertId || 0, 
                affectedRows: result.affectedRows || 0,
                changedRows: result.changedRows || 0
            }];
        }
    }

    async executeSQL(sql, params, connectionContext = null) {
        const trimmedSql = sql.trim().toUpperCase();
        
        // Simple SQL parser for basic operations
        if (trimmedSql.startsWith('SELECT')) {
            return this.executeSelect(sql, params, connectionContext);
        } else if (trimmedSql.startsWith('INSERT')) {
            return await this.executeInsert(sql, params, connectionContext);
        } else if (trimmedSql.startsWith('UPDATE')) {
            return await this.executeUpdate(sql, params, connectionContext);
        } else if (trimmedSql.startsWith('DELETE')) {
            return await this.executeDelete(sql, params, connectionContext);
        } else if (trimmedSql.startsWith('CREATE')) {
            return this.executeCreate(sql, params);
        } else {
            throw new Error(`Unsupported SQL operation: ${sql}`);
        }
    }

    executeSelect(sql, params, connectionContext = null) {
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
        
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
            let data = dataSource[tableName] || [];
            
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
        let data = dataSource[tableName] || [];
        
        // Apply WHERE conditions (basic implementation)
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1];
            // Count placeholders in WHERE clause only
            const wherePlaceholderCount = (whereClause.match(/\?/g) || []).length;
            const whereParams = params.slice(0, wherePlaceholderCount);
            data = this.applyWhereClause(data, whereClause, whereParams);
            // Remove WHERE parameters from the array, leaving LIMIT/OFFSET parameters
            params = params.slice(wherePlaceholderCount);
        }
        
        // Apply ORDER BY
        const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
        if (orderMatch) {
            const orderClause = orderMatch[1];
            data = this.applyOrderBy(data, orderClause);
        }
        
        // Apply LIMIT and OFFSET
        const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
        if (limitMatch) {
            const limit = parseInt(limitMatch[1]);
            const offset = limitMatch[2] ? parseInt(limitMatch[2]) : 0;
            data = data.slice(offset, offset + limit);
        }
        
        return data;
    }

    async executeInsert(sql, params, connectionContext = null) {
        const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
            
        if (!dataSource[tableName]) {
            dataSource[tableName] = [];
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
            // For ID generation, use timestamp + random to ensure uniqueness
            // This avoids ID conflicts across concurrent operations
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            newRecord.id = parseInt(`${timestamp}${random.toString().padStart(3, '0')}`);
        }
        
        dataSource[tableName].push(newRecord);
        
        // Use connection context for save if available
        const saveMethod = connectionContext ? connectionContext.save.bind(connectionContext) : this.save.bind(this);
        try {
            await saveMethod();
        } catch (error) {
            // Rollback the insert if save failed
            const index = dataSource[tableName].findIndex(r => r.id === newRecord.id);
            if (index !== -1) {
                dataSource[tableName].splice(index, 1);
            }
            throw error;
        }
        
        return { 
            insertId: newRecord.id, 
            affectedRows: 1 
        };
    }

    async executeUpdate(sql, params, connectionContext = null) {
        const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
            
        let data = dataSource[tableName] || [];
        
        // Parse SET clause and extract SET parameters
        const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
        let setParams = [];
        let updates = {};
        
        if (setMatch) {
            const setClause = setMatch[1];
            const setPlaceholderCount = (setClause.match(/\?/g) || []).length;
            setParams = params.slice(0, setPlaceholderCount);
            updates = this.parseSetClause(setClause, setParams);
        }
        
        // Parse WHERE clause and extract WHERE parameters
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+LIMIT|$)/i);
        let whereParams = [];
        
        if (whereMatch) {
            const whereClause = whereMatch[1];
            whereParams = params.slice(setParams.length); // Remaining params are for WHERE
            data = this.applyWhereClause(data, whereClause, whereParams);
        }
        
        // Apply SET operations if we have updates
        if (Object.keys(updates).length > 0) {
            // Store original state for rollback
            const originalStates = [];
            let affectedRows = 0;
            
            data.forEach(record => {
                const originalData = dataSource[tableName].find(r => r.id === record.id);
                if (originalData) {
                    originalStates.push({
                        id: originalData.id,
                        data: { ...originalData }
                    });
                    Object.assign(originalData, updates);
                    affectedRows++;
                }
            });
            
            // Use connection context for save if available
            const saveMethod = connectionContext ? connectionContext.save.bind(connectionContext) : this.save.bind(this);
            try {
                await saveMethod();
            } catch (error) {
                // Rollback updates if save failed
                originalStates.forEach(({ id, data: originalData }) => {
                    const index = dataSource[tableName].findIndex(r => r.id === id);
                    if (index !== -1) {
                        dataSource[tableName][index] = originalData;
                    }
                });
                throw error;
            }
            
            return { affectedRows };
        }
        
        return { affectedRows: 0 };
    }

    async executeDelete(sql, params, connectionContext = null) {
        const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
        if (!tableMatch) return { affectedRows: 0 };
        
        let tableName = tableMatch[1].toLowerCase();
        // Map user_sessions to sessions for JSON adapter
        if (tableName === 'user_sessions') {
            tableName = 'sessions';
        }
        
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
            
        let data = dataSource[tableName] || [];
        
        // Apply WHERE conditions
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+LIMIT|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1];
            const toDelete = this.applyWhereClause([...data], whereClause, params);
            
            // Store original data for rollback
            const originalData = [...dataSource[tableName]];
            
            // Remove records
            dataSource[tableName] = data.filter(record => 
                !toDelete.some(deleteRecord => deleteRecord.id === record.id)
            );
            
            // Use connection context for save if available
            const saveMethod = connectionContext ? connectionContext.save.bind(connectionContext) : this.save.bind(this);
            try {
                await saveMethod();
            } catch (error) {
                // Rollback deletion if save failed
                dataSource[tableName] = originalData;
                throw error;
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
}

// Connection wrapper that provides isolated transaction state
class JSONConnection {
    constructor(sharedAdapter) {
        this.sharedAdapter = sharedAdapter;
        this.transactionInProgress = false;
        this.transactionData = null;
    }

    async connect() {
        // Delegate to shared adapter
        return this.sharedAdapter.connect();
    }

    async query(sql, params = []) {
        await this.sharedAdapter.ensureInitialized();
        
        // Set connection context and use shared adapter's query method
        this.sharedAdapter._connectionContext = this;
        try {
            return await this.sharedAdapter.executeSQL(sql, params, this);
        } finally {
            this.sharedAdapter._connectionContext = null;
        }
    }

    async execute(sql, params = []) {
        await this.sharedAdapter.ensureInitialized();
        
        // Set connection context and use shared adapter's execute method
        this.sharedAdapter._connectionContext = this;
        try {
            const trimmedSql = sql.trim().toUpperCase();
            if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
                // For SELECT queries, return rows
                const rows = await this.sharedAdapter.executeSQL(sql, params, this);
                return [rows]; // Return as array to match MySQL format
            } else {
                // For INSERT/UPDATE/DELETE queries, execute and return result
                const result = await this.sharedAdapter.executeSQL(sql, params, this);
                return [{
                    insertId: result.insertId || 0, 
                    affectedRows: result.affectedRows || 0,
                    changedRows: result.changedRows || 0
                }];
            }
        } finally {
            this.sharedAdapter._connectionContext = null;
        }
    }

    // Override save to handle transaction state
    async save() {
        // Don't save if transaction is in progress (will be saved on commit)
        if (this.transactionInProgress) {
            return;
        }
        return this.sharedAdapter.save();
    }

    async close() {
        // Clean up transaction state if any
        if (this.transactionInProgress) {
            await this.rollback();
        }
        return this.sharedAdapter.close();
    }

    async release() {
        // Clean up transaction state if any
        if (this.transactionInProgress) {
            await this.rollback();
        }
    }

    async beginTransaction() {
        if (this.transactionInProgress) {
            throw new Error('Transaction already in progress');
        }
        
        // Create a deep copy of current data for rollback
        this.transactionData = JSON.parse(JSON.stringify(this.sharedAdapter.data));
        this.transactionInProgress = true;
        
        logger.debug('Transaction started', null, { 
            dbPath: this.sharedAdapter.dbPath,
            dataKeys: Object.keys(this.sharedAdapter.data)
        });
        
        return [];
    }

    async commit() {
        if (!this.transactionInProgress) {
            throw new Error('No transaction in progress');
        }
        
        try {
            // Start with current shared data (which may have been modified by other connections)
            const mergedData = JSON.parse(JSON.stringify(this.sharedAdapter.data));
            
            // For each table in transaction data, merge it properly
            for (const [tableName, transactionRecords] of Object.entries(this.transactionData)) {
                if (Array.isArray(transactionRecords)) {
                    // For array tables, we need to merge intelligently
                    if (!mergedData[tableName]) {
                        mergedData[tableName] = [];
                    }
                    
                    // Create a map of existing records by ID from current shared data
                    const existingMap = new Map();
                    mergedData[tableName].forEach(record => {
                        if (record.id) {
                            existingMap.set(record.id, record);
                        }
                    });
                    
                    // Add/update records from transaction, taking precedence
                    transactionRecords.forEach(record => {
                        if (record.id) {
                            existingMap.set(record.id, record);
                        }
                    });
                    
                    // Convert back to array, sorted by ID for consistency
                    mergedData[tableName] = Array.from(existingMap.values()).sort((a, b) => (a.id || 0) - (b.id || 0));
                } else {
                    // For non-array data, transaction data takes precedence
                    mergedData[tableName] = transactionRecords;
                }
            }
            
            // Update shared adapter with merged data
            this.sharedAdapter.data = mergedData;
            
            // Save the committed changes
            await this.sharedAdapter.save();
            
            this.transactionData = null;
            this.transactionInProgress = false;
            
            logger.debug('Transaction committed', null, { 
                dbPath: this.sharedAdapter.dbPath
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
            // Simply discard transaction data - don't copy it back
            this.transactionData = null;
            this.transactionInProgress = false;
            
            logger.debug('Transaction rolled back', null, { 
                dbPath: this.sharedAdapter.dbPath
            });
            
            return [];
        } catch (error) {
            logger.error('Error during transaction rollback', error, { 
                dbPath: this.sharedAdapter.dbPath
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
        this.sharedAdapter = new JSONAdapter(dbPath);
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
            await this.sharedAdapter.connect();
            this.connected = true;
        }
        // Return a new connection instance with isolated transaction state
        return new JSONConnection(this.sharedAdapter);
    }

    async query(sql, params = []) {
        // Get a connection and delegate to the adapter's query method
        const connection = await this.getConnection();
        return await connection.query(sql, params);
    }

    async execute(sql, params = []) {
        // Get a connection and delegate to the adapter's execute method
        const connection = await this.getConnection();
        return await connection.execute(sql, params);
    }

    on(event, callback) {
        // Basic event handling for compatibility
        if (event === 'connection') {
            // Simulate connection event
            setTimeout(() => callback({ threadId: 1 }), 0);
        }
    }

    async end() {
        return this.sharedAdapter.close();
    }
}

module.exports = {
    JSONAdapter,
    JSONPool,
    createPool: (config) => new JSONPool(config)
};