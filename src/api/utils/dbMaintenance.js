const { logger } = require('./logger');

/**
 * Database maintenance utilities for partition management and optimization
 */
class DatabaseMaintenance {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Create new partition for audit_log table for the upcoming year
     */
    async createAuditLogPartition(year) {
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
        try {
            const cutoffYear = new Date().getFullYear() - yearsToKeep;
            
            const [partitions] = await this.pool.execute(`
                SELECT PARTITION_NAME 
                FROM information_schema.PARTITIONS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'audit_log' 
                AND PARTITION_NAME != 'p_future'
                AND CAST(SUBSTRING(PARTITION_NAME, 2) AS UNSIGNED) < ?
            `, [cutoffYear]);
            
            const droppedPartitions = [];
            for (const partition of partitions) {
                const partitionName = partition.PARTITION_NAME;
                await this.pool.execute(`
                    ALTER TABLE audit_log DROP PARTITION ${partitionName}
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
        try {
            const tables = ['users', 'projects', 'project_images', 'github_repos', 'user_sessions', 'audit_log'];
            const results = [];
            
            for (const table of tables) {
                const startTime = Date.now();
                await this.pool.execute(`ANALYZE TABLE ${table}`);
                await this.pool.execute(`OPTIMIZE TABLE ${table}`);
                const duration = Date.now() - startTime;
                
                results.push({ table, duration });
                logger.info(`Optimized table`, null, { table, duration });
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
            const [result] = await this.pool.execute(`
                DELETE FROM user_sessions 
                WHERE expires_at < NOW() OR is_active = FALSE
            `);
            
            const deletedCount = result.affectedRows;
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
            
            const metrics = {};
            poolStats.forEach(row => {
                metrics[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE);
            });
            
            return { success: true, metrics };
            
        } catch (error) {
            logger.error('Failed to get performance metrics', null, { error: error.message });
            throw error;
        }
    }
}

module.exports = DatabaseMaintenance;