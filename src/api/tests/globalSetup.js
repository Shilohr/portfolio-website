const { logger } = require('../utils/logger');

module.exports = async () => {
    // Set global test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32-chars';
    process.env.DB_HOST = 'localhost';
    process.env.DB_USER = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_NAME = 'test_db';
    process.env.GITHUB_USERNAME = 'testuser';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

    // Initialize test logger
    logger.info('Global test setup completed', null, {
        environment: 'test',
        timestamp: new Date().toISOString()
    });

    // Set up global test utilities
    global.testConfig = {
        timeout: 10000,
        retries: 3,
        parallel: true
    };
};