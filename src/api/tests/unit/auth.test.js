const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRoutes = require('../../routes/auth');
const TestHelpers = require('../helpers');

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('mysql2/promise');

describe('Authentication Routes', () => {
  let app;
  let mockDb;
  let mockConnection;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock database
    mockDb = TestHelpers.getMockDb();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    
    mockDb.getConnection.mockResolvedValue(mockConnection);
    
    // Setup Express app with auth routes
    const cookieParser = require('cookie-parser');
    const csrf = require('csurf');
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // CSRF protection for testing
    const csrfProtection = csrf({
      cookie: {
        httpOnly: true,
        secure: false, // false for testing
        sameSite: 'lax'
      },
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
    });

    // Add CSRF token endpoint
    app.get('/api/csrf-token', csrfProtection, (req, res) => {
      res.json({ csrfToken: req.csrfToken() });
    });

    // Apply CSRF protection to auth endpoints
    app.use('/api/auth/login', csrfProtection);
    app.use('/api/auth/register', csrfProtection);
    app.use('/api/auth/logout', csrfProtection);
    
    app.use((req, res, next) => {
      req.db = mockDb;
      next();
    });
    app.use('/api/auth', authRoutes);
  });

  describe('POST /api/auth/register', () => {
    const validUserData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123'
    };

    it('should register a new user successfully', async () => {
      // Mock database responses
      mockDb.execute
        .mockResolvedValueOnce([[]]) // Check existing user
        .mockResolvedValueOnce([{ insertId: 1 }]) // Insert user
        .mockResolvedValueOnce([]); // Audit log

      bcrypt.hash.mockResolvedValue('hashedpassword');

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validUserData);

      TestHelpers.validateSuccessResponse(response, 201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.userId).toBe(1);
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 12);
    });

    it('should return 400 for invalid input', async () => {
      const invalidData = {
        username: 'ab', // Too short
        email: 'invalid-email',
        password: '123' // Too short
      };

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(invalidData);

      TestHelpers.validateErrorResponse(response, 400);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 409 if user already exists', async () => {
      mockDb.execute.mockResolvedValueOnce([[{ id: 1 }]]); // User exists

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validUserData);

      TestHelpers.validateErrorResponse(response, 409, 'Username or email already exists');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database error'));

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validUserData);

      TestHelpers.validateErrorResponse(response, 500, 'Registration failed');
    });

    it('should sanitize input data', async () => {
      const userDataWithExtraSpaces = {
        username: '  testuser  ',
        email: '  TEST@EXAMPLE.COM  ',
        password: 'Password123'
      };

      mockDb.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([]);

      bcrypt.hash.mockResolvedValue('hashedpassword');

      const response = await request(app)
        .post('/api/auth/register')
        .send(userDataWithExtraSpaces);

      expect(response.status).toBe(201);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['testuser', 'test@example.com', 'hashedpassword'])
      );
    });

    it('should validate password complexity', async () => {
      const weakPasswordData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'weakpassword' // Missing uppercase and number
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should validate username format', async () => {
      const invalidUsernameData = {
        username: 'test@user', // Invalid characters
        email: 'test@example.com',
        password: 'Password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUsernameData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle missing required fields', async () => {
      const incompleteData = {
        username: 'testuser'
        // Missing email and password
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(incompleteData);

      TestHelpers.validateErrorResponse(response, 400);
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      username: 'testuser',
      password: 'Password123'
    };

    const mockUser = TestHelpers.createTestUserData();

    it('should login successfully with valid credentials', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[mockUser]]) // Get user
        .mockResolvedValueOnce([]) // Reset login attempts
        .mockResolvedValueOnce([]) // Store session
        .mockResolvedValueOnce([]); // Audit log

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('test-token');
      bcrypt.hash.mockResolvedValue('token-hash');

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBe('test-token');
      expect(response.body.user.username).toBe('testuser');
      TestHelpers.validateTokenStructure(response.body.token);
    });

    it('should return 401 for invalid credentials', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[mockUser]]) // Get user
        .mockResolvedValueOnce([]); // Update login attempts

      bcrypt.compare.mockResolvedValue(false);

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should return 401 if user does not exist', async () => {
      mockDb.execute.mockResolvedValueOnce([[]]); // No user found

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
    });

    it('should return 423 if account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        locked_until: Date.now() + 1000000 // Future timestamp
      };

      mockDb.execute.mockResolvedValueOnce([[lockedUser]]);

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 423, 'Account temporarily locked');
    });

    it('should return 403 if account is inactive', async () => {
      const inactiveUser = {
        ...mockUser,
        is_active: false
      };

      mockDb.execute.mockResolvedValueOnce([[inactiveUser]]);

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 403, 'Account is deactivated');
    });

    it('should lock account after max failed attempts', async () => {
      const userWithAttempts = {
        ...mockUser,
        login_attempts: 4 // One more attempt will lock
      };

      mockDb.execute
        .mockResolvedValueOnce([[userWithAttempts]]) // Get user
        .mockResolvedValueOnce([]); // Update with lock

      bcrypt.compare.mockResolvedValue(false);

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET login_attempts = ?, locked_until = ?'),
        [5, expect.any(Number), userWithAttempts.id]
      );
    });

    it('should allow login with email instead of username', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[mockUser]]) // Get user by email
        .mockResolvedValueOnce([]) // Reset login attempts
        .mockResolvedValueOnce([]) // Store session
        .mockResolvedValueOnce([]); // Audit log

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('test-token');
      bcrypt.hash.mockResolvedValue('token-hash');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test@example.com', password: 'Password123' });

      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle database errors during login', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 500, 'Login failed');
    });

    it('should handle JWT generation errors', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[mockUser]]) // Get user
        .mockResolvedValueOnce([]); // Reset login attempts

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT generation failed');
      });

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .send(validLoginData);

      TestHelpers.validateErrorResponse(response, 500, 'Login failed');
    });

    it('should validate input length requirements', async () => {
      const shortData = {
        username: 'ab', // Too short
        password: '123' // Too short
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(shortData);

      TestHelpers.validateErrorResponse(response, 400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute.mockResolvedValue([]);
      bcrypt.hash.mockResolvedValue('token-hash');

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.message).toBe('Logout successful');
    });

    it('should return 400 if no token provided', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      TestHelpers.validateErrorResponse(response, 400, 'No token provided');
    });

    it('should handle invalid token gracefully', async () => {
      const token = 'invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 500, 'Logout failed');
    });

    it('should handle malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'InvalidFormat token');

      TestHelpers.validateErrorResponse(response, 400, 'No token provided');
    });

    it('should handle database errors during logout', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute.mockRejectedValue(new Error('Database error'));
      bcrypt.hash.mockResolvedValue('token-hash');

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 500, 'Logout failed');
    });

    it('should handle expired tokens', async () => {
      const token = TestHelpers.generateExpiredToken();
      
      jwt.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      const csrfData = await TestHelpers.getCsrfToken(app);
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', csrfData.cookies)
        .set('X-CSRF-Token', csrfData.token)
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 500, 'Logout failed');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return user profile with valid token', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'developer',
        created_at: '2023-01-01',
        last_login: '2023-01-02'
      };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Valid session
        .mockResolvedValueOnce([[mockUser]]); // User data

      bcrypt.hash.mockResolvedValue('token-hash');

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.role).toBe('developer');
    });

    it('should return 401 if no token provided', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      TestHelpers.validateErrorResponse(response, 401, 'Access token required');
    });

    it('should return 403 if token is invalid', async () => {
      const token = 'invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
    });

    it('should return 403 if session is not found', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute.mockResolvedValueOnce([[]]); // No valid session
      bcrypt.hash.mockResolvedValue('token-hash');

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 403, 'Session expired or invalid');
    });

    it('should return 404 if user not found', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Valid session
        .mockResolvedValueOnce([[]]); // User not found
      bcrypt.hash.mockResolvedValue('token-hash');

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 404, 'User not found');
    });

    it('should handle database errors during profile fetch', async () => {
      const token = TestHelpers.generateTestToken();
      const decodedToken = { userId: 1, username: 'testuser' };

      jwt.verify.mockReturnValue(decodedToken);
      mockDb.execute.mockRejectedValue(new Error('Database error'));
      bcrypt.hash.mockResolvedValue('token-hash');

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 500, 'Failed to fetch profile');
    });

    it('should handle malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'InvalidFormat token');

      TestHelpers.validateErrorResponse(response, 401, 'Access token required');
    });

    it('should handle expired tokens', async () => {
      const token = TestHelpers.generateExpiredToken();
      
      jwt.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle SQL injection attempts in login', async () => {
      const maliciousInput = {
        username: "'; DROP TABLE users; --",
        password: 'Password123'
      };

      mockDb.execute.mockResolvedValue([[]]); // No user found

      const response = await request(app)
        .post('/api/auth/login')
        .send(maliciousInput);

      TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM users WHERE username = ? OR email = ?'),
        [maliciousInput.username, maliciousInput.username]
      );
    });

    it('should handle XSS attempts in registration', async () => {
      const xssData = {
        username: '<script>alert("xss")</script>',
        email: 'test@example.com',
        password: 'Password123'
      };

      mockDb.execute.mockResolvedValue([[]]); // No existing user

      const response = await request(app)
        .post('/api/auth/register')
        .send(xssData);

      // Should fail validation due to username containing invalid characters
      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle very long input strings', async () => {
      const longString = 'a'.repeat(10000);
      const longData = {
        username: longString,
        email: 'test@example.com',
        password: 'Password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(longData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle null and undefined values', async () => {
      const nullData = {
        username: null,
        email: null,
        password: null
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(nullData);

      TestHelpers.validateErrorResponse(response, 400);
    });
  });
});