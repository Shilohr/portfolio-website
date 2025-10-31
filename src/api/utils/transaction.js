const { logger } = require('./logger');

class TransactionManager {
    constructor(db) {
        this.db = db;
    }

    // Execute a function within a database transaction
    async execute(transactionFn, options = {}) {
        const connection = await this.db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            logger.debug('Transaction started', null, { 
                connectionId: connection.threadId,
                isolationLevel: options.isolationLevel || 'REPEATABLE READ'
            });
            
            // Set isolation level if specified
            if (options.isolationLevel) {
                await connection.execute(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
            }
            
            // Execute the transaction function
            const result = await transactionFn(connection);
            
            await connection.commit();
            
            logger.debug('Transaction committed', null, { 
                connectionId: connection.threadId 
            });
            
            return result;
            
        } catch (error) {
            await connection.rollback();
            
            logger.error('Transaction rolled back', null, { 
                connectionId: connection.threadId,
                error: error.message,
                stack: error.stack
            });
            
            throw error;
            
        } finally {
            connection.release();
        }
    }

    // Execute multiple operations in parallel within a transaction
    async executeBatch(operations, options = {}) {
        return this.execute(async (connection) => {
            const results = [];
            
            for (const operation of operations) {
                const { query, params, name } = operation;
                
                try {
                    const [result] = await connection.execute(query, params);
                    results.push({ name, success: true, result });
                    
                    logger.debug('Batch operation completed', null, { 
                        name, 
                        affectedRows: result.affectedRows,
                        insertId: result.insertId 
                    });
                    
                } catch (error) {
                    results.push({ name, success: false, error: error.message });
                    throw new Error(`Batch operation '${name}' failed: ${error.message}`);
                }
            }
            
            return results;
        }, options);
    }

    // Execute with retry logic
    async executeWithRetry(transactionFn, maxRetries = 3, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.execute(transactionFn, options);
                
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain errors
                if (this.isNonRetryableError(error)) {
                    throw error;
                }
                
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    
                    logger.warn('Transaction failed, retrying', null, { 
                        attempt, 
                        maxRetries,
                        delay,
                        error: error.message 
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        logger.error('Transaction failed after all retries', null, { 
            maxRetries, 
            finalError: lastError.message 
        });
        
        throw lastError;
    }

    // Check if error is non-retryable
    isNonRetryableError(error) {
        const nonRetryablePatterns = [
            /duplicate entry/i,
            /foreign key constraint/i,
            /syntax error/i,
            /column .* does not exist/i,
            /table .* doesn't exist/i,
            /access denied/i,
            /authentication failed/i
        ];
        
        return nonRetryablePatterns.some(pattern => 
            pattern.test(error.message)
        );
    }

    // Create savepoint
    async createSavepoint(connection, name) {
        await connection.execute(`SAVEPOINT ${name}`);
        logger.debug('Savepoint created', null, { name });
    }

    // Rollback to savepoint
    async rollbackToSavepoint(connection, name) {
        await connection.execute(`ROLLBACK TO SAVEPOINT ${name}`);
        logger.debug('Rolled back to savepoint', null, { name });
    }

    // Release savepoint
    async releaseSavepoint(connection, name) {
        await connection.execute(`RELEASE SAVEPOINT ${name}`);
        logger.debug('Savepoint released', null, { name });
    }
}

// Helper function to create transaction manager
function createTransactionManager(db) {
    return new TransactionManager(db);
}

module.exports = {
    TransactionManager,
    createTransactionManager
};