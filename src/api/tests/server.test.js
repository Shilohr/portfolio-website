const request = require('supertest');
const mysql = require('mysql2/promise');

// Mock dependencies
jest.mock('mysql2/promise');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  requestLogger: jest.fn((req, res, next) => next())
}));

describe('Server Configuration', () => {
  let app;
  let mockDb;
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set required environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-testing';
    process.env.DB_HOST = 'localhost';
    process.env.DB_USER = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.DB_NAME = 'test';
    
    // Mock database
    mockDb = {
      execute: jest.fn(),
      query: jest.fn(),
      end: jest.fn()
    };
    
    mysql.createPool.mockReturnValue(mockDb);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Environment Validation', () => {
    it('should start successfully with valid environment', async () => {
      // Import server after setting up environment
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;

      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should fail with missing JWT_SECRET', async () => {
      delete process.env.JWT_SECRET;
      
      expect(() => {
        delete require.cache[require.resolve('../server')];
        require('../server');
      }).toThrow('Missing required environment variables: JWT_SECRET');
    });

    it('should fail with short JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short';
      
      expect(() => {
        delete require.cache[require.resolve('../server')];
        require('../server');
      }).toThrow('JWT_SECRET must be at least 64 characters in production');
    });

    it('should fail with weak JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'your-secret-key-that-is-long-but-still-weak';
      
      expect(() => {
        delete require.cache[require.resolve('../server')];
        require('../server');
      }).toThrow('JWT_SECRET cannot contain common patterns');
    });

    it('should require production-specific variables in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_PASSWORD;
      
      expect(() => {
        delete require.cache[require.resolve('../server')];
        require('../server');
      }).toThrow('Missing required production environment variables: DB_PASSWORD');
    });
  });

  describe('Middleware Configuration', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
    });

    it('should use helmet security headers', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should parse JSON body', async () => {
      mockDb.execute.mockResolvedValue([[]]);
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123'
        });
      
      // Should not return 400 for missing JSON parsing
      expect(response.status).not.toBe(400);
    });

    it('should handle rate limiting', async () => {
      const promises = Array(100).fill().map(() => 
        request(app).get('/api/health')
      );
      
      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      // Some responses should be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Database Connection', () => {
    it('should create database pool with correct configuration', () => {
      delete require.cache[require.resolve('../server')];
      require('../server');
      
      expect(mysql.createPool).toHaveBeenCalledWith({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000
      });
    });

    it('should handle database connection errors gracefully', async () => {
      mysql.createPool.mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      
      expect(() => {
        delete require.cache[require.resolve('../server')];
        require('../server');
      }).toThrow('Database connection failed');
    });
  });

  describe('Route Configuration', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
    });

    it('should mount auth routes at /api/auth', async () => {
      // Get CSRF token first
      const csrfResponse = await request(app)
        .get('/api/csrf-token')
        .expect(200);
      
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfResponse.headers['set-cookie'])
        .set('X-CSRF-Token', csrfResponse.body.csrfToken)
        .send({ username: 'test', password: 'test' });
      
      // Should return auth-related error, not 404
      expect(response.status).not.toBe(404);
    });

    it('should mount projects routes at /api/projects', async () => {
      mockDb.execute.mockResolvedValue([[]]);
      
      const response = await request(app).get('/api/projects');
      
      expect(response.status).not.toBe(404);
    });

    it('should mount github routes at /api/github', async () => {
      const response = await request(app).get('/api/github/repos');
      
      expect(response.status).not.toBe(404);
    });

    it('should handle 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown');
      
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Route not found');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
    });

    it('should handle async errors properly', async () => {
      // Mock a route that throws an async error
      app.get('/test-async-error', async (req, res) => {
        throw new Error('Async error');
      });
      
      const response = await request(app).get('/test-async-error');
      
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Internal server error');
    });

    it('should handle validation errors', async () => {
      // Get CSRF token first
      const csrfResponse = await request(app)
        .get('/api/csrf-token')
        .expect(200);
      
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', csrfResponse.headers['set-cookie'])
        .set('X-CSRF-Token', csrfResponse.body.csrfToken)
        .send({
          username: 'ab', // Too short
          email: 'invalid-email',
          password: '123' // Too short
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.details.validationErrors).toBeDefined();
    });

    it('should log errors appropriately', async () => {
      const { logger } = require('./utils/logger');
      
      app.get('/test-error', (req, res) => {
        throw new Error('Test error');
      });
      
      await request(app).get('/test-error');
      
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    beforeEach(() => {
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
    });

    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });

    it('should check database connectivity', async () => {
      mockDb.execute.mockResolvedValue([[{ 1: 1 }]]);
      
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.database).toBe('connected');
    });

    it('should report database connection failure', async () => {
      mockDb.execute.mockRejectedValue(new Error('DB Error'));
      
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(503);
      expect(response.body.database).toBe('disconnected');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should handle SIGTERM gracefully', async () => {
      delete require.cache[require.resolve('../server')];
      const server = require('../server');
      
      // Mock process.exit
      const mockExit = jest.fn();
      process.exit = mockExit;
      
      // Simulate SIGTERM
      process.emit('SIGTERM');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockDb.end).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT gracefully', async () => {
      delete require.cache[require.resolve('../server')];
      const server = require('../server');
      
      const mockExit = jest.fn();
      process.exit = mockExit;
      
      process.emit('SIGINT');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockDb.end).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('Development vs Production', () => {
    it('should enable detailed error reporting in development', async () => {
      process.env.NODE_ENV = 'development';
      
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
      
      app.get('/test-error', (req, res) => {
        throw new Error('Development error');
      });
      
      const response = await request(app).get('/test-error');
      
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Development error');
      expect(response.body.error.details.stack).toBeDefined();
    });

    it('should hide error details in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-production-environment-usage';
      process.env.DB_PASSWORD = 'test-password-that-is-long-enough-for-production';
      process.env.DB_ROOT_PASSWORD = 'test-root-password-that-is-long-enough-for-production';
      
      delete require.cache[require.resolve('../server')];
      const { app: serverApp } = require('../server');
      app = serverApp;
      
      app.get('/test-error', (req, res) => {
        throw new Error('Production error');
      });
      
      const response = await request(app).get('/test-error');
      
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Internal server error');
      expect(response.body.error.details).toBeUndefined();
    });
  });
});