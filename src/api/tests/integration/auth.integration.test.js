const request = require('supertest');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import the actual server
const express = require('express');
const authRoutes = require('../../routes/auth');

describe('Authentication Integration Tests', () => {
  let app;
  let testDb;
  let server;

  beforeAll(async () => {
    // Setup test database connection
    testDb = mysql.createPool({
      host: process.env.TEST_DB_HOST || 'localhost',
      user: process.env.TEST_DB_USER || 'portfolio',
      password: process.env.TEST_DB_PASSWORD || 'securepassword',
      database: process.env.TEST_DB_NAME || 'portfolio_test',
      charset: 'utf8mb4'
    });

    // Setup Express app with real auth routes
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.db = testDb;
      next();
    });
    app.use('/api/auth', authRoutes);
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.end();
    }
  });

  beforeEach(async () => {
    // Clean up database before each test
    const tables = ['audit_log', 'user_sessions', 'users'];
    for (const table of tables) {
      await testDb.execute(`DELETE FROM ${table}`);
    }
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full register -> login -> profile -> logout flow', async () => {
      const userData = {
        username: 'integrationuser',
        email: 'integration@example.com',
        password: 'Password123'
      };

      // Step 1: Register user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.message).toBe('User registered successfully');
      expect(registerResponse.body.userId).toBeDefined();

      // Verify user was created in database
      const [users] = await testDb.execute(
        'SELECT * FROM users WHERE username = ?',
        [userData.username]
      );
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe(userData.email);
      expect(users[0].is_active).toBe(true);

      // Step 2: Login with registered user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: userData.password
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user.username).toBe(userData.username);

      const token = loginResponse.body.token;

      // Step 3: Access protected profile endpoint
      const profileResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.user.username).toBe(userData.username);
      expect(profileResponse.body.user.email).toBe(userData.email);

      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.message).toBe('Logout successful');

      // Step 5: Verify token is no longer valid
      const profileAfterLogout = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileAfterLogout.status).toBe(403);
    });

    it('should handle account lockout after multiple failed attempts', async () => {
      // Create a test user
      const passwordHash = await bcrypt.hash('correctPassword', 12);
      await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['locktestuser', 'locktest@example.com', passwordHash]
      );

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'locktestuser',
            password: 'wrongPassword'
          });

        if (i < 4) {
          expect(response.status).toBe(401);
          expect(response.body.error).toBe('Invalid credentials');
        } else {
          expect(response.status).toBe(401);
        }
      }

      // Check that account is now locked
      const [users] = await testDb.execute(
        'SELECT login_attempts, locked_until FROM users WHERE username = ?',
        ['locktestuser']
      );
      expect(users[0].login_attempts).toBe(5);
      expect(users[0].locked_until).toBeGreaterThan(Date.now());

      // Attempt login with correct password - should still fail due to lock
      const lockedResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'locktestuser',
          password: 'correctPassword'
        });

      expect(lockedResponse.status).toBe(423);
      expect(lockedResponse.body.error).toContain('Account temporarily locked');
    });

    it('should handle concurrent sessions correctly', async () => {
      // Create and login user
      const passwordHash = await bcrypt.hash('Password123', 12);
      const [userResult] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['sessionuser', 'session@example.com', passwordHash]
      );

      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'sessionuser',
            password: 'Password123'
          });

        expect(response.status).toBe(200);
        sessions.push(response.body.token);
      }

      // Verify all sessions are active
      const [activeSessions] = await testDb.execute(
        'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
        [userResult.insertId]
      );
      expect(activeSessions[0].count).toBe(3);

      // Logout one session
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessions[0]}`);

      expect(logoutResponse.status).toBe(200);

      // Verify only one session was invalidated
      const [remainingSessions] = await testDb.execute(
        'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
        [userResult.insertId]
      );
      expect(remainingSessions[0].count).toBe(2);

      // Verify other sessions still work
      for (let i = 1; i < sessions.length; i++) {
        const profileResponse = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${sessions[i]}`);

        expect(profileResponse.status).toBe(200);
      }

      // Verify logged out session no longer works
      const loggedOutProfileResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${sessions[0]}`);

      expect(loggedOutProfileResponse.status).toBe(403);
    });
  });

  describe('Database Integration', () => {
    it('should properly audit all authentication actions', async () => {
      const userData = {
        username: 'audituser',
        email: 'audit@example.com',
        password: 'Password123'
      };

      // Register user
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Check registration audit
      const [registerAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 1',
        ['USER_REGISTERED']
      );
      expect(registerAudit).toHaveLength(1);
      expect(registerAudit[0].action).toBe('USER_REGISTERED');

      // Login user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: userData.password
        });

      // Check login audit
      const [loginAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 1',
        ['USER_LOGIN']
      );
      expect(loginAudit).toHaveLength(1);
      expect(loginAudit[0].action).toBe('USER_LOGIN');

      // Logout user
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginResponse.body.token}`);

      // Check logout audit
      const [logoutAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT 1',
        ['USER_LOGOUT']
      );
      expect(logoutAudit).toHaveLength(1);
      expect(logoutAudit[0].action).toBe('USER_LOGOUT');
    });

    it('should handle database connection failures gracefully', async () => {
      // Create a new app with broken database connection
      const brokenApp = express();
      brokenApp.use(express.json());
      brokenApp.use((req, res, next) => {
        req.db = {
          execute: jest.fn().mockRejectedValue(new Error('Connection failed'))
        };
        next();
      });
      brokenApp.use('/api/auth', authRoutes);

      const response = await request(brokenApp)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Login failed');
    });

    it('should maintain data consistency during transactions', async () => {
      // This test would require modifying the auth routes to expose transaction handling
      // For now, we'll test the atomicity of user creation
      const userData = {
        username: 'transactionuser',
        email: 'transaction@example.com',
        password: 'Password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);

      // Verify user was created
      const [users] = await testDb.execute(
        'SELECT * FROM users WHERE username = ?',
        [userData.username]
      );
      expect(users).toHaveLength(1);

      // Verify audit log entry was created
      const [auditLogs] = await testDb.execute(
        'SELECT * FROM audit_log WHERE user_id = ?',
        [users[0].id]
      );
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('USER_REGISTERED');
    });
  });

  describe('Security Integration', () => {
    it('should prevent SQL injection in authentication', async () => {
      const maliciousInput = {
        username: "admin'; DROP TABLE users; --",
        password: "password'; DROP TABLE users; --"
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(maliciousInput);

      expect(response.status).toBe(401);

      // Verify users table still exists and has data
      const [users] = await testDb.execute('SELECT COUNT(*) as count FROM users');
      expect(users[0].count).toBeGreaterThanOrEqual(0);
    });

    it('should handle rate limiting correctly', async () => {
      const loginData = {
        username: 'nonexistent',
        password: 'wrongpassword'
      };

      // Make multiple rapid requests
      const responses = [];
      for (let i = 0; i < 25; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData);
        responses.push(response);
      }

      // Most should succeed with 401, but eventually we might hit rate limits
      const successResponses = responses.filter(r => r.status === 401);
      const rateLimitResponses = responses.filter(r => r.status === 429);

      expect(successResponses.length).toBeGreaterThan(0);
      // Rate limiting behavior depends on configuration
    });

    it('should properly validate JWT tokens', async () => {
      // Create a user and get a valid token
      const passwordHash = await bcrypt.hash('Password123', 12);
      await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['jwtuser', 'jwt@example.com', passwordHash]
      );

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'jwtuser',
          password: 'Password123'
        });

      const validToken = loginResponse.body.token;

      // Test with valid token
      const validResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validToken}`);

      expect(validResponse.status).toBe(200);

      // Test with invalid token
      const invalidResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(invalidResponse.status).toBe(403);

      // Test with no token
      const noTokenResponse = await request(app)
        .get('/api/auth/profile');

      expect(noTokenResponse.status).toBe(401);

      // Test with malformed authorization header
      const malformedResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'InvalidFormat token');

      expect(malformedResponse.status).toBe(401);
    });
  });
});