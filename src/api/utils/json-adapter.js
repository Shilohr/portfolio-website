const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

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
        await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    }

    async query(sql, params = []) {
        await this.ensureInitialized();
        logger.info('JSON query executing', null, { sql, params });
        
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
            return this.executeInsert(sql, params);
        } else if (trimmedSql.startsWith('UPDATE')) {
            return this.executeUpdate(sql, params);
        } else if (trimmedSql.startsWith('DELETE')) {
            return this.executeDelete(sql, params);
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

    executeInsert(sql, params) {
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
        this.save(); // Async but we'll fire and forget for now
        
        return { 
            insertId: newRecord.id, 
            affectedRows: 1 
        };
    }

    executeUpdate(sql, params) {
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
            
            let affectedRows = 0;
            data.forEach(record => {
                const originalData = this.data[tableName].find(r => r.id === record.id);
                if (originalData) {
                    Object.assign(originalData, updates);
                    affectedRows++;
                }
            });
            
            this.save(); // Async but fire and forget
            return { affectedRows };
        }
        
        return { affectedRows: 0 };
    }

    executeDelete(sql, params) {
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
            
            // Remove records
            this.data[tableName] = data.filter(record => 
                !toDelete.some(deleteRecord => deleteRecord.id === record.id)
            );
            
            this.save(); // Async but fire and forget
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
        // Very basic WHERE clause implementation
        // This is a simplified version - in production you'd want a proper SQL parser
        return data.filter(record => {
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
                    
                    return true; // If we can't parse, include it
                });
            });
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
        // No-op for JSON adapter (simplified)
        return [];
    }

    async commit() {
        // Save any pending changes
        await this.save();
        return [];
    }

    async rollback() {
        // No-op for JSON adapter (simplified)
        return [];
    }
}

// Create a pool-like interface for compatibility
class JSONPool {
    constructor(config) {
        const dbPath = config.database || config.name || 'portfolio.json';
        this.adapter = new JSONAdapter(dbPath);
        this.connected = false;
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
    createPool: (config) => new JSONPool(config.database || 'portfolio.json')
};