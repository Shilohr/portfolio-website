const { logger } = require('./logger');

/**
 * Database maintenance utilities for partition management and optimization
 */
class DatabaseMaintenance {
    constructor(pool) {
        this.pool = pool;
        this.isMySQL = this.detectMySQLCapability(pool);
    }

    /**
     * Detect if the pool supports MySQL-specific operations
     */
    detectMySQLCapability(pool) {
        // Check for MySQL-specific properties or methods
        return pool.config && 
               pool.config.connectionLimit !== undefined &&
               pool._allConnections !== undefined &&
               typeof pool.query === 'function' &&
               pool.constructor.name === 'Pool';
    }

    /**
     * Create new partition for audit_log table for the upcoming year
     */
    async createAuditLogPartition(year) {
        if (!this.isMySQL) {
            logger.info('Partition management not supported for non-MySQL adapters', null, { 
                adapter: 'JSON/SQLite',
                operation: 'createAuditLogPartition',
                year 
            });
            return { success: true, message: 'Partition management not applicable for this database adapter' };
        }
        
        // Validate year parameter
        const currentYear = new Date().getFullYear();
        if (!year || year < currentYear || year > currentYear + 10) {
            throw new Error(`Invalid year: ${year}. Must be between ${currentYear} and ${currentYear + 10}`);
        }

        try {
            const nextYear = year + 1;
            const partitionName = `p${year}`;
            const previousPartition = `p${year - 1}`;
            
            // Check if partition already exists
            const [existingPartitions] = await this.pool.execute(`
                SELECT PARTITION_NAME 
                FROM information_schema.PARTITIONS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'audit_log' 
                AND PARTITION_NAME = ?
            `, [partitionName]);
            
            if (existingPartitions.length > 0) {
                logger.info(`Partition ${partitionName} already exists`, null, { year });
                return { success: true, message: 'Partition already exists' };
            }
            
            // Create new partition
            await this.pool.execute(`
                ALTER TABLE audit_log 
                REORGANIZE PARTITION p_future INTO (
                    PARTITION ${partitionName} VALUES LESS THAN (${nextYear}),
                    PARTITION p_future VALUES LESS THAN MAXVALUE
                )
            `);
            
            logger.info(`Created audit_log partition for year ${year}`, null, { year, partitionName });
            return { success: true, message: `Created partition ${partitionName}` };
            
        } catch (error) {
            logger.error('Failed to create audit_log partition', null, { 
                year, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Drop old partitions to free up space
     */
    async dropOldPartitions(yearsToKeep = 3) {
        if (!this.isMySQL) {
            logger.info('Partition management not supported for non-MySQL adapters', null, { 
                adapter: 'JSON/SQLite',
                operation: 'dropOldPartitions',
                yearsToKeep 
            });
            return { success: true, message: 'Partition management not applicable for this database adapter' };
        }
        
        // Validate yearsToKeep parameter
        if (!yearsToKeep || yearsToKeep < 1 || yearsToKeep > 10) {
            throw new Error(`Invalid yearsToKeep: ${yearsToKeep}. Must be between 1 and 10`);
        }

        try {
            const cutoffYear = new Date().getFullYear() - yearsToKeep;
            
            const [partitions] = await this.pool.execute(`
                SELECT PARTITION_NAME 
                FROM information_schema.PARTITIONS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'audit_log' 
                AND PARTITION_NAME != 'p_future'
                AND PARTITION_NAME REGEXP '^p[0-9]+$'
                AND CAST(SUBSTRING(PARTITION_NAME, 2) AS UNSIGNED) < ?
            `, [cutoffYear]);
            
            const droppedPartitions = [];
            for (const partition of partitions) {
                const partitionName = partition.PARTITION_NAME;
                // Additional safety check for partition name format
                if (!/^p[0-9]+$/.test(partitionName)) {
                    logger.warn('Skipping invalid partition name format', null, { partitionName });
                    continue;
                }
                
                await this.pool.execute(`
                    ALTER TABLE audit_log DROP PARTITION \`${partitionName}\`
                `);
                droppedPartitions.push(partitionName);
                logger.info(`Dropped old audit_log partition`, null, { 
                    partition: partitionName, 
                    cutoffYear 
                });
            }
            
            return { 
                success: true, 
                droppedPartitions,
                message: `Dropped ${droppedPartitions.length} old partitions` 
            };
            
        } catch (error) {
            logger.error('Failed to drop old partitions', null, { 
                yearsToKeep, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Analyze and optimize tables for better performance
     */
    async optimizeTables() {
        if (!this.isMySQL) {
            logger.info('Table optimization not supported for non-MySQL adapters', null, { 
                adapter: 'JSON/SQLite',
                operation: 'optimizeTables'
            });
            return { success: true, message: 'Table optimization not applicable for this database adapter' };
        }

        try {
            const tables = ['users', 'projects', 'project_images', 'github_repos', 'user_sessions', 'audit_log'];
            const results = [];
            
            for (const table of tables) {
                const startTime = Date.now();
                // Sanitize table name to prevent SQL injection
                const sanitizedTable = table.replace(/[^a-zA-Z0-9_]/g, '');
                if (!tables.includes(sanitizedTable)) {
                    logger.warn('Skipping invalid table name', null, { table });
                    continue;
                }
                
                await this.pool.execute(`ANALYZE TABLE \`${sanitizedTable}\``);
                await this.pool.execute(`OPTIMIZE TABLE \`${sanitizedTable}\``);
                const duration = Date.now() - startTime;
                
                results.push({ table: sanitizedTable, duration });
                logger.info(`Optimized table`, null, { table: sanitizedTable, duration });
            }
            
            return { success: true, results };
            
        } catch (error) {
            logger.error('Failed to optimize tables', null, { error: error.message });
            throw error;
        }
    }

    /**
     * Clean up expired user sessions
     */
    async cleanupExpiredSessions() {
        try {
            let deletedCount = 0;
            
            if (this.isMySQL) {
                const [result] = await this.pool.execute(`
                    DELETE FROM user_sessions 
                    WHERE expires_at < NOW() OR is_active = FALSE
                `);
                deletedCount = result.affectedRows;
            } else {
                // For JSON/SQLite adapters, use a different approach
                const sessions = await this.pool.execute('SELECT * FROM user_sessions');
                const expiredSessions = sessions.filter(session => 
                    new Date(session.expires_at) < new Date() || !session.is_active
                );
                
                for (const session of expiredSessions) {
                    await this.pool.execute('DELETE FROM user_sessions WHERE id = ?', [session.id]);
                    deletedCount++;
                }
            }
            
            logger.info('Cleaned up expired sessions', null, { deletedCount });
            
            return { success: true, deletedCount };
            
        } catch (error) {
            logger.error('Failed to cleanup expired sessions', null, { error: error.message });
            throw error;
        }
    }

    /**
     * Get database performance metrics
     */
    async getPerformanceMetrics() {
        if (!this.isMySQL) {
            logger.info('Performance metrics not supported for non-MySQL adapters', null, { 
                adapter: 'JSON/SQLite',
                operation: 'getPerformanceMetrics'
            });
            return { 
                success: true, 
                metrics: {
                    adapter: 'JSON/SQLite',
                    note: 'Performance metrics not available for this database adapter',
                    timestamp: new Date().toISOString()
                }
            };
        }

        try {
            const [poolStats] = await this.pool.execute(`
                SELECT 
                    VARIABLE_NAME,
                    VARIABLE_VALUE
                FROM performance_schema.global_status 
                WHERE VARIABLE_NAME IN (
                    'Connections', 
                    'Max_used_connections', 
                    'Threads_connected',
                    'Queries',
                    'Slow_queries'
                )
            `);
            
            const metrics = {
                timestamp: new Date().toISOString(),
                adapter: 'MySQL'
            };
            poolStats.forEach(row => {
                metrics[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE) || 0;
            });
            
            return { success: true, metrics };
            
} catch (error) {
            logger.error('Failed to get performance metrics', null, { error: error.message });
            // Return basic metrics instead of throwing
            return { 
                success: true, 
                metrics: {
                    timestamp: new Date().toISOString(),
                    adapter: 'MySQL',
                    error: 'Failed to fetch detailed metrics',
                    note: error.message
                }
            };
        }
    }
}

module.exports = DatabaseMaintenance;