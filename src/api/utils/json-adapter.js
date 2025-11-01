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
            // For SELECT queries, return rows as first element of array
            const rows = await this.executeSQL(sql, params, this._connectionContext);
            return [rows]; // Return as array to match MySQL format
        } else {
            // For INSERT/UPDATE/DELETE queries, execute and return result as first element
            const result = await this.executeSQL(sql, params, this._connectionContext);
            return [result]; // Return result object as first element to match MySQL format
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
        
        // Handle optimized project queries with JOINs and GROUP_CONCAT
        if (sql.includes('FROM projects p') && sql.includes('LEFT JOIN')) {
            return this.executeOptimizedProjectQuery(sql, params, dataSource);
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

    executeOptimizedProjectQuery(sql, params, dataSource) {
        // Extract WHERE conditions from the main query
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
        let whereClause = whereMatch ? whereMatch[1] : '';
        
        // Extract ORDER BY
        const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
        const orderClause = orderMatch ? orderMatch[1] : 'p.order_index ASC, p.created_at DESC';
        
        // Get base projects data
        let projects = dataSource.projects || [];
        
        // Apply WHERE conditions to projects
        let remainingParams = params;
        if (whereClause) {
            // Count placeholders in WHERE clause
            const wherePlaceholderCount = (whereClause.match(/\?/g) || []).length;
            const whereParams = params.slice(0, wherePlaceholderCount);
            projects = this.applyWhereClause(projects, whereClause, whereParams);
            // Remove WHERE parameters from the array, leaving LIMIT/OFFSET parameters
            remainingParams = params.slice(wherePlaceholderCount);
        }
        
        // Extract LIMIT and OFFSET from remaining parameters
        let limit = null;
        let offset = 0;
        if (sql.includes('LIMIT') && remainingParams.length > 0) {
            limit = remainingParams[0] || null;
            if (remainingParams.length > 1) {
                offset = remainingParams[1] || 0;
            }
        }
        
        // Apply ORDER BY
        projects = this.applyProjectOrderBy(projects, orderClause);
        
        // Calculate total count before LIMIT for pagination
        const totalCount = projects.length;
        
        // Apply LIMIT and OFFSET
        const limitedProjects = limit !== null ? projects.slice(offset, offset + limit) : projects;
        
        
        
        // Batch fetch all needed users and technologies
        const userIds = [...new Set(limitedProjects.map(p => p.user_id).filter(id => id))];
        const projectIds = limitedProjects.map(p => p.id);
        
        const usersMap = new Map();
        const technologiesMap = new Map();
        
        // Batch fetch users
        if (userIds.length > 0) {
            const users = dataSource.users || [];
            users.filter(user => userIds.includes(user.id)).forEach(user => {
                usersMap.set(user.id, user.username);
            });
        }
        
        // Batch fetch technologies
        if (projectIds.length > 0) {
            const projectTechs = dataSource.project_technologies || [];
            projectTechs.forEach(pt => {
                if (projectIds.includes(pt.project_id)) {
                    if (!technologiesMap.has(pt.project_id)) {
                        technologiesMap.set(pt.project_id, []);
                    }
                    technologiesMap.get(pt.project_id).push(pt.technology);
                }
            });
        }
        
        // Enrich projects with batch-fetched data
        return limitedProjects.map(project => ({
            ...project,
            owner_username: usersMap.get(project.user_id) || null,
            technologies: technologiesMap.has(project.id) 
                ? technologiesMap.get(project.id).sort().join(',') 
                : '',
            total_count: totalCount
        }));
    }

    applyProjectOrderBy(data, orderClause) {
        // Handle multiple ORDER BY columns for projects
        const orders = orderClause.split(',').map(order => order.trim());
        
        return [...data].sort((a, b) => {
            for (const order of orders) {
                const match = order.match(/(?:p\.)?(\w+)\s*(ASC|DESC)?/i);
                if (match) {
                    const column = match[1];
                    const direction = match[2] || 'ASC';
                    
                    let aVal = a[column];
                    let bVal = b[column];
                    
                    // Handle null/undefined values
                    if (aVal === null || aVal === undefined) aVal = '';
                    if (bVal === null || bVal === undefined) bVal = '';
                    
                    // Convert to string for consistent comparison
                    aVal = String(aVal);
                    bVal = String(bVal);
                    
                    if (direction.toUpperCase() === 'DESC') {
                        if (bVal > aVal) return 1;
                        if (bVal < aVal) return -1;
                    } else {
                        if (aVal > bVal) return 1;
                        if (aVal < bVal) return -1;
                    }
                }
            }
            return 0;
        });
    }

    applyWhereClause(data, whereClause, params) {
        // Check for unsupported SQL constructs that could cause issues
        const unsupportedPatterns = [
            /LIMIT\s+/i,
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

        // Allow parentheses for grouping but check for unsupported constructs within them
        const cleanWhereClause = whereClause.replace(/\([^)]*\)/g, '()'); // Replace parenthetical groups with placeholder
        for (const pattern of unsupportedPatterns) {
            if (pattern.test(cleanWhereClause)) {
                throw new Error(`Unsupported SQL construct in WHERE clause: ${whereClause}`);
            }
        }

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

        // Handle empty WHERE clause
        if (!whereClause || whereClause.trim() === '') {
            return data;
        }

        return data.filter(record => {
            try {
                // Handle basic equality conditions with AND/OR
                const orConditions = whereClause.split('OR').map(c => c.trim());
                
                return orConditions.some(orCondition => {
                    const andConditions = orCondition.split('AND').map(c => c.trim());
                    return andConditions.every(andCondition => {
                        // Skip empty conditions
                        if (!andCondition || andCondition.trim() === '') {
                            return true;
                        }
                        // Handle equality conditions
                        const match = andCondition.match(/((?:\w+\.)?\w+)\s*=\s*\?/i);
                        if (match && params.length > 0) {
                            const column = match[1].split('.').pop(); // Strip table alias prefix
                            const paramIndex = this.getParamIndex(whereClause, andCondition);
                            if (paramIndex < 0 || paramIndex >= params.length) {
                                throw new Error(`Invalid parameter index for condition: ${andCondition}`);
                            }
                            return record[column] == params[paramIndex]; // Use == for loose comparison
                        }
                        
                        // Handle greater than conditions (for expires_at > NOW())
                        const greaterMatch = andCondition.match(/((?:\w+\.)?\w+)\s*>\s*NOW\(\)/i);
                        if (greaterMatch) {
                            const column = greaterMatch[1].split('.').pop(); // Strip table alias prefix
                            const recordValue = record[column];
                            if (recordValue) {
                                const expiresTime = new Date(recordValue).getTime();
                                const nowTime = Date.now();
                                return expiresTime > nowTime;
                            }
                            return false;
                        }
                        
                        // Handle less than conditions (for expires_at < NOW())
                        const lessMatch = andCondition.match(/((?:\w+\.)?\w+)\s*<\s*NOW\(\)/i);
                        if (lessMatch) {
                            const column = lessMatch[1].split('.').pop(); // Strip table alias prefix
                            const recordValue = record[column];
                            if (recordValue === null || recordValue === undefined) {
                                return false; // If no expires_at, don't consider it expired
                            }
                            const expiresTime = new Date(recordValue).getTime();
                            const nowTime = Date.now();
                            return expiresTime < nowTime;
                        }
                        
                        // Handle boolean conditions (is_active = TRUE)
                        const booleanMatch = andCondition.match(/((?:\w+\.)?\w+)\s*=\s*(TRUE|FALSE)/i);
                        if (booleanMatch) {
                            const column = booleanMatch[1].split('.').pop(); // Strip table alias prefix
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
        let paramIndex = 0;
        
        for (let i = 0; i < conditions.length; i++) {
            const condition = conditions[i].trim();
            
            // Check if this condition contains a parameter placeholder
            if (condition.includes('?')) {
                // Normalize both conditions by removing table aliases and extra whitespace
                const normalizedCondition = condition.replace(/((?:\w+\.)?\w+)/g, '$1').replace(/\s+/g, ' ').trim();
                const normalizedSpecific = specificCondition.replace(/((?:\w+\.)?\w+)/g, '$1').replace(/\s+/g, ' ').trim();
                
                if (normalizedCondition === normalizedSpecific) {
                    return paramIndex;
                }
                paramIndex++;
            }
        }
        
        return -1; // Not found
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

    async executeInsert(sql, params, connectionContext = null) {
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
        
        let record;
        let tableName;
        
        // Parse INSERT INTO table_name (col1, col2) VALUES (?, ?)
        const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s+VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
            tableName = insertMatch[1].toLowerCase();
            const columns = insertMatch[2].split(',').map(col => col.trim());
            const valuesPlaceholders = insertMatch[3].split(',').map(p => p.trim());
            
            // Validate placeholder count
            if (valuesPlaceholders.length !== params.length) {
                throw new Error(`Parameter count mismatch in INSERT. Expected ${valuesPlaceholders.length}, got ${params.length}`);
            }
            
            // Create record object
            record = {};
            columns.forEach((column, index) => {
                record[column] = params[index];
            });
        } else {
            // Parse INSERT INTO table_name SET ? (object parameter)
            const setMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s+SET\s+\?/i);
            if (setMatch) {
                tableName = setMatch[1].toLowerCase();
                if (params.length !== 1 || typeof params[0] !== 'object') {
                    throw new Error(`INSERT INTO ... SET ? requires a single object parameter`);
                }
                record = { ...params[0] };
            } else {
                throw new Error(`Unsupported INSERT syntax: ${sql}`);
            }
        }
        
        // Add auto-increment ID if not present
        if (!record.id && Array.isArray(dataSource[tableName])) {
            const maxId = dataSource[tableName].reduce((max, item) => Math.max(max, item.id || 0), 0);
            record.id = maxId + 1;
        }
        
        // Add timestamps if applicable
        if (record.created_at === undefined) {
            record.created_at = new Date().toISOString();
        }
        if (record.updated_at === undefined) {
            record.updated_at = new Date().toISOString();
        }
        
        // Initialize table if it doesn't exist
        if (!dataSource[tableName]) {
            dataSource[tableName] = [];
        }
        
        // Add record
        dataSource[tableName].push(record);
        
        // Save if not in transaction
        if (!connectionContext || !connectionContext.transactionInProgress) {
            await this.save();
        }
        
        return {
            insertId: record.id || 0,
            affectedRows: 1,
            changedRows: 0
        };
    }
    
    async executeUpdate(sql, params, connectionContext = null) {
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
        
        // Parse UPDATE table_name SET col1 = ?, col2 = ? WHERE condition
        const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
        if (!updateMatch) {
            throw new Error(`Unsupported UPDATE syntax: ${sql}`);
        }
        
        const tableName = updateMatch[1].toLowerCase();
        const setClause = updateMatch[2];
        const whereClause = updateMatch[3];
        
        // Parse SET clause and count parameters
        const setAssignments = setClause.split(',').map(a => a.trim());
        const setParamCount = setAssignments.filter(a => a.includes('?')).length;
        
        // Split params: SET params first, WHERE params second
        const setParams = params.slice(0, setParamCount);
        const whereParams = params.slice(setParamCount);
        
        // Parse SET clause
        const updates = this.parseSetClause(setClause, setParams);
        
        // Add updated_at timestamp if not explicitly set
        if (!updates.updated_at) {
            updates.updated_at = new Date().toISOString();
        }
        
        // Find records to update
        let records = dataSource[tableName] || [];
        const originalRecords = [...records];
        
        // Apply WHERE clause
        records = this.applyWhereClause(records, whereClause, whereParams);
        
        // Update matching records
        let affectedRows = 0;
        records.forEach(record => {
            Object.assign(record, updates);
            affectedRows++;
        });
        
        // Calculate changed rows (records that actually changed)
        let changedRows = 0;
        records.forEach((record, index) => {
            const originalIndex = originalRecords.findIndex(r => r.id === record.id);
            if (originalIndex >= 0) {
                const original = originalRecords[originalIndex];
                // Check if any field actually changed
                const hasChanges = Object.keys(updates).some(key => original[key] !== record[key]);
                if (hasChanges) changedRows++;
            }
        });
        
        // Save if not in transaction
        if (!connectionContext || !connectionContext.transactionInProgress) {
            await this.save();
        }
        
        return {
            insertId: 0,
            affectedRows,
            changedRows
        };
    }
    
    async executeDelete(sql, params, connectionContext = null) {
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
        
        // Parse DELETE FROM table_name WHERE condition
        const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
        if (!deleteMatch) {
            throw new Error(`Unsupported DELETE syntax: ${sql}`);
        }
        
        const tableName = deleteMatch[1].toLowerCase();
        const whereClause = deleteMatch[2];
        
        if (!whereClause) {
            throw new Error('DELETE without WHERE clause is not supported for safety');
        }
        
        // Find records to delete
        let records = dataSource[tableName] || [];
        const recordsToDelete = this.applyWhereClause([...records], whereClause, params);
        
        // Remove records
        const deletedIds = new Set(recordsToDelete.map(r => r.id));
        dataSource[tableName] = records.filter(record => !deletedIds.has(record.id));
        
        // Save if not in transaction
        if (!connectionContext || !connectionContext.transactionInProgress) {
            await this.save();
        }
        
        return {
            insertId: 0,
            affectedRows: recordsToDelete.length,
            changedRows: recordsToDelete.length
        };
    }
    
    async executeCreate(sql, params, connectionContext = null) {
        // Use transaction data if connection is in transaction
        const dataSource = (connectionContext && connectionContext.transactionInProgress) 
            ? connectionContext.transactionData 
            : this.data;
        
        // Parse CREATE TABLE statements (basic support)
        const createMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
        if (createMatch) {
            const tableName = createMatch[1].toLowerCase();
            
            // Initialize table if it doesn't exist
            if (!dataSource[tableName]) {
                dataSource[tableName] = [];
                
                // Save if not in transaction
                if (!connectionContext || !connectionContext.transactionInProgress) {
                    await this.save();
                }
            }
            
            return {
                insertId: 0,
                affectedRows: 0,
                changedRows: 0
            };
        }
        
        throw new Error(`Unsupported CREATE syntax: ${sql}`);
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
                // For SELECT queries, return rows as first element of array
                const rows = await this.sharedAdapter.executeSQL(sql, params, this);
                return [rows]; // Return as array to match MySQL format
            } else {
                // For INSERT/UPDATE/DELETE queries, execute and return result as first element
                const result = await this.sharedAdapter.executeSQL(sql, params, this);
                return [result]; // Return result object as first element to match MySQL format
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
    
    // Add end method for MySQL compatibility
    async end() {
        return this.close();
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
    
    // Add end method to pool for compatibility
    async close() {
        return this.end();
    }
}

module.exports = {
    JSONAdapter,
    JSONPool,
    createPool: (config) => new JSONPool(config)
};