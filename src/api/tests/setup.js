// Don't import mysql2 here as it's mocked in the test files
const { logger } = require('../utils/logger');
require('dotenv').config({ path: '../../.env' });

// Test database configuration
const testDbConfig = {
  host: process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.TEST_DB_USER || process.env.DB_USER || 'portfolio',
  password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || 'securepassword',
  database: process.env.TEST_DB_NAME || 'portfolio_test',
  charset: 'utf8mb4'
};

let testDb;

// Global test setup
beforeAll(async () => {
  try {
    // Only set up real database for integration tests
    if (process.env.TEST_TYPE === 'integration') {
      const mysql = require('mysql2/promise');
      
      // Create test database if it doesn't exist
      const connection = await mysql.createConnection({
        host: testDbConfig.host,
        user: testDbConfig.user,
        password: testDbConfig.password
      });

      await connection.execute(`CREATE DATABASE IF NOT EXISTS ${testDbConfig.database}`);
      await connection.end();

      // Connect to test database
      testDb = mysql.createPool(testDbConfig);

      // Load schema
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../../database/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      const statements = schema.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await testDb.execute(statement);
        }
      }

      logger.info('Test database setup completed', null, { 
          status: 'success',
          environment: 'test'
      });
    }
  } catch (error) {
    logger.error('Test database setup failed', null, { 
        error: error.message,
        stack: error.stack,
        environment: 'test'
    });
    // Don't throw error for unit tests - they use mocks
    if (process.env.TEST_TYPE === 'integration') {
      throw error;
    }
  }
});

// Global test teardown
afterAll(async () => {
  if (testDb) {
    await testDb.end();
  }
});

// Clean up database before each test
beforeEach(async () => {
  if (testDb && process.env.TEST_TYPE === 'integration') {
    const tables = [
      'audit_log',
      'user_sessions', 
      'project_technologies',
      'project_images',
      'github_repos',
      'projects',
      'users'
    ];

    for (const table of tables) {
      await testDb.execute(`DELETE FROM ${table}`);
    }
  }
});

// Mock database for tests that don't need real DB
jest.mock('mysql2/promise', () => {
  const mockPool = {
    execute: jest.fn(),
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue({
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    })
  };
  
  return {
    createPool: jest.fn(() => mockPool)
  };
});

// Global test utilities
global.testUtils = {
  getTestDb: () => testDb,
  
  createTestUser: async (userData = {}) => {
    const defaultUser = {
      username: 'testuser',
      email: 'test@example.com',
      password_hash: await require('bcryptjs').hash('password123', 12),
      role: 'developer',
      is_active: true
    };
    
    const [result] = await testDb.execute(
      'INSERT INTO users SET ?',
      [{ ...defaultUser, ...userData }]
    );
    
    return { id: result.insertId, ...defaultUser, ...userData };
  },

  createTestProject: async (projectData = {}) => {
    const defaultProject = {
      title: 'Test Project',
      description: 'A test project',
      status: 'active',
      featured: false,
      order_index: 0
    };
    
    const [result] = await testDb.execute(
      'INSERT INTO projects SET ?',
      [{ ...defaultProject, ...projectData }]
    );
    
    return { id: result.insertId, ...defaultProject, ...projectData };
  },

  generateTestToken: (userId = 1, username = 'testuser', role = 'developer') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId, username, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  }
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';