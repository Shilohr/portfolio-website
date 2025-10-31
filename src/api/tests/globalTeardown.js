const { logger } = require('../utils/logger');

module.exports = async () => {
    // Clean up global test state
    delete global.testConfig;
    
    // Clear any remaining timers
    clearTimeout();
    clearInterval();
    
    // Close any remaining database connections
    if (global.testDb) {
        await global.testDb.end();
        delete global.testDb;
    }
    
    // Final test cleanup logging
    logger.info('Global test teardown completed', null, {
        environment: 'test',
        timestamp: new Date().toISOString()
    });
    
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.DB_HOST;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
    delete process.env.GITHUB_USERNAME;
    delete process.env.CORS_ORIGIN;
    delete process.env.LOG_LEVEL;
};