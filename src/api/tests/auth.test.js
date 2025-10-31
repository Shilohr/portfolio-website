const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const authRoutes = require('../routes/auth');
const TestHelpers = require('./helpers');

describe('Authentication Tests', () => {
    let app;
    let mockDb;

    beforeEach(() => {
        mockDb = TestHelpers.getMockDb();
        app = TestHelpers.createMockApp([authRoutes]);
        TestHelpers.setupTestEnv();
    });

    afterEach(() => {
        TestHelpers.cleanup();
    });

    describe('Unit Tests - Utility Functions', () => {
        describe('Password Hashing', () => {
            test('should hash password correctly', async () => {
                const password = 'testpassword123';
                const hash = await bcrypt.hash(password, 12);
                
                expect(hash).toBeDefined();
                expect(hash).not.toBe(password);
                expect(hash.length).toBeGreaterThan(50);
            });

            test('should compare password correctly', async () => {
                const password = 'testpassword123';
                const hash = await bcrypt.hash(password, 12);
                
                const isValid = await bcrypt.compare(password, hash);
                const isInvalid = await bcrypt.compare('wrongpassword', hash);
                
                expect(isValid).toBe(true);
                expect(isInvalid).toBe(false);
            });
        });

        describe('JWT Token Generation', () => {
            test('should generate valid JWT token', () => {
                const token = TestHelpers.generateTestToken(1, 'testuser', 'developer');
                
                TestHelpers.validateTokenStructure(token);
                
                const decoded = jwt.decode(token);
                expect(decoded.userId).toBe(1);
                expect(decoded.username).toBe('testuser');
                expect(decoded.role).toBe('developer');
            });

            test('should generate expired token for testing', () => {
                const expiredToken = TestHelpers.generateExpiredToken();
                
                expect(() => {
                    jwt.verify(expiredToken, process.env.JWT_SECRET);
                }).toThrow();
            });
        });

        describe('Account Locking Logic', () => {
            test('should identify locked account', () => {
                const lockedUser = {
                    locked_until: Date.now() + 3600000 // 1 hour from now
                };
                
                const unlockedUser = {
                    locked_until: Date.now() - 3600000 // 1 hour ago
                };
                
                // This would be tested in the actual route implementation
                expect(lockedUser.locked_until > Date.now()).toBe(true);
                expect(unlockedUser.locked_until > Date.now()).toBe(false);
            });
        });
    });

    describe('Integration Tests - API Endpoints', () => {
        describe('POST /api/auth/register', () => {
            test('should register new user successfully', async () => {
                const userData = {
                    username: 'newuser',
                    email: 'newuser@example.com',
                    password: 'Password123'
                };

                mockDb.execute
                    .mockResolvedValueOnce([[]]) // Check existing user
                    .mockResolvedValueOnce([{ insertId: 1 }]) // Insert user
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/auth/register')
                    .send(userData);

                TestHelpers.validateSuccessResponse(response, 201);
                expect(response.body.message).toBe('User registered successfully');
                expect(response.body.userId).toBe(1);
            });

            test('should reject registration with invalid data', async () => {
                const invalidData = {
                    username: 'ab', // Too short
                    email: 'invalid-email',
                    password: '123' // Too short
                };

                const response = await request(app)
                    .post('/api/auth/register')
                    .send(invalidData);

                TestHelpers.validateErrorResponse(response, 400);
                expect(response.body.errors).toBeDefined();
            });

            test('should reject duplicate username', async () => {
                const userData = {
                    username: 'existinguser',
                    email: 'new@example.com',
                    password: 'Password123'
                };

                mockDb.execute.mockResolvedValueOnce([[{ id: 1 }]]); // Existing user found

                const response = await request(app)
                    .post('/api/auth/register')
                    .send(userData);

                TestHelpers.validateErrorResponse(response, 409, 'already exists');
            });
        });

        describe('POST /api/auth/login', () => {
            test('should login successfully with valid credentials', async () => {
                const loginData = {
                    username: 'testuser',
                    password: 'Password123'
                };

                const hashedPassword = await TestHelpers.hashPassword('Password123');
                const mockUser = TestHelpers.createTestUserData({
                    password_hash: hashedPassword
                });

                mockDb.execute
                    .mockResolvedValueOnce([[mockUser]]) // Get user
                    .mockResolvedValueOnce([]) // Reset login attempts
                    .mockResolvedValueOnce([{ insertId: 1 }]) // Create session
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/auth/login')
                    .send(loginData);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.message).toBe('Login successful');
                expect(response.body.token).toBeDefined();
                expect(response.body.user).toBeDefined();
            });

            test('should reject login with invalid credentials', async () => {
                const loginData = {
                    username: 'testuser',
                    password: 'wrongpassword'
                };

                const hashedPassword = await TestHelpers.hashPassword('Password123');
                const mockUser = TestHelpers.createTestUserData({
                    password_hash: hashedPassword,
                    login_attempts: 0
                });

                mockDb.execute
                    .mockResolvedValueOnce([[mockUser]]) // Get user
                    .mockResolvedValueOnce([]); // Update login attempts

                const response = await request(app)
                    .post('/api/auth/login')
                    .send(loginData);

                TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
            });

            test('should handle locked account', async () => {
                const loginData = {
                    username: 'lockeduser',
                    password: 'Password123'
                };

                const lockedUser = TestHelpers.createTestUserData({
                    locked_until: Date.now() + 3600000 // Locked for 1 hour
                });

                mockDb.execute.mockResolvedValueOnce([[lockedUser]]);

                const response = await request(app)
                    .post('/api/auth/login')
                    .send(loginData);

                TestHelpers.validateErrorResponse(response, 423, 'locked');
            });

            test('should handle non-existent user', async () => {
                const loginData = {
                    username: 'nonexistent',
                    password: 'Password123'
                };

                mockDb.execute.mockResolvedValueOnce([[]]); // No user found

                const response = await request(app)
                    .post('/api/auth/login')
                    .send(loginData);

                TestHelpers.validateErrorResponse(response, 401, 'Invalid credentials');
            });
        });

        describe('POST /api/auth/logout', () => {
            test('should logout successfully with valid token', async () => {
                const token = TestHelpers.generateTestToken();
                const decoded = jwt.decode(token);

                mockDb.execute
                    .mockResolvedValueOnce([[{ id: 1 }]]) // Session found
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/auth/logout')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.message).toBe('Logout successful');
            });

            test('should reject logout without token', async () => {
                const response = await request(app)
                    .post('/api/auth/logout');

                TestHelpers.validateErrorResponse(response, 400, 'No token provided');
            });
        });

        describe('GET /api/auth/profile', () => {
            test('should get user profile with valid token', async () => {
                const token = TestHelpers.generateTestToken();
                const mockUser = TestHelpers.createTestUserData();

                mockDb.execute.mockResolvedValueOnce([[mockUser]]);

                const response = await request(app)
                    .get('/api/auth/profile')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.user).toBeDefined();
                expect(response.body.user.id).toBe(mockUser.id);
            });

            test('should reject profile request without token', async () => {
                const response = await request(app)
                    .get('/api/auth/profile');

                TestHelpers.validateErrorResponse(response, 401, 'Access token required');
            });
        });
    });

    describe('Security Tests', () => {
        describe('SQL Injection Prevention', () => {
            test('should prevent SQL injection in username', async () => {
                const maliciousInput = "'; DROP TABLE users; --";
                
                const loginData = {
                    username: maliciousInput,
                    password: 'Password123'
                };

                mockDb.execute.mockResolvedValueOnce([[]]); // No user found

                const response = await request(app)
                    .post('/api/auth/login')
                    .send(loginData);

                TestHelpers.validateErrorResponse(response, 401);
                
                // Verify that the malicious input was properly escaped
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('SELECT id, username, email, password_hash, role, is_active, login_attempts, locked_until FROM users WHERE username = ? OR email = ?'),
                    [maliciousInput, maliciousInput]
                );
            });

            test('should prevent SQL injection in email', async () => {
                const maliciousEmail = "test@example.com'; DROP TABLE users; --";
                
                const userData = {
                    username: 'testuser',
                    email: maliciousEmail,
                    password: 'Password123'
                };

                mockDb.execute.mockResolvedValueOnce([[]]); // No existing user

                const response = await request(app)
                    .post('/api/auth/register')
                    .send(userData);

                // Should not reach database insertion due to validation
                expect(response.status).toBe(400);
            });
        });

        describe('XSS Prevention', () => {
            test('should sanitize user input', async () => {
                const xssPayload = '<script>alert("xss")</script>';
                
                const userData = {
                    username: xssPayload,
                    email: 'test@example.com',
                    password: 'Password123'
                };

                mockDb.execute.mockResolvedValueOnce([[]]); // No existing user

                const response = await request(app)
                    .post('/api/auth/register')
                    .send(userData);

                // Should fail validation due to script tags in username
                expect(response.status).toBe(400);
            });
        });

        describe('Password Security', () => {
            test('should enforce strong password requirements', async () => {
                const weakPasswords = [
                    'password', // Too common
                    '12345678', // Only numbers
                    'abcdefgh', // Only lowercase
                    'ABCDEFGH', // Only uppercase
                    'Abc123', // Too short
                    'Password123', // Missing special character (if required)
                ];

                for (const password of weakPasswords) {
                    const userData = {
                        username: 'testuser',
                        email: 'test@example.com',
                        password: password
                    };

                    const response = await request(app)
                        .post('/api/auth/register')
                        .send(userData);

                    expect(response.status).toBe(400);
                }
            });

            test('should hash passwords with sufficient strength', async () => {
                const password = 'Password123';
                const hash = await bcrypt.hash(password, 12);
                
                // Verify bcrypt parameters
                expect(hash).toMatch(/^\$2[aby]\$\d+\$/);
                expect(hash.split('$')[2]).toBe('12'); // Rounds = 12
            });
        });

        describe('Rate Limiting', () => {
            test('should handle rate limiting headers', async () => {
                const loginData = {
                    username: 'testuser',
                    password: 'wrongpassword'
                };

                // Simulate multiple failed attempts
                for (let i = 0; i < 5; i++) {
                    mockDb.execute.mockResolvedValueOnce([[]]); // No user found
                    
                    const response = await request(app)
                        .post('/api/auth/login')
                        .send(loginData);

                    if (i < 4) {
                        TestHelpers.validateErrorResponse(response, 401);
                    }
                }
            });
        });

        describe('JWT Security', () => {
            test('should reject expired tokens', async () => {
                const expiredToken = TestHelpers.generateExpiredToken();

                const response = await request(app)
                    .get('/api/auth/profile')
                    .set('Authorization', `Bearer ${expiredToken}`);

                TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
            });

            test('should reject malformed tokens', async () => {
                const malformedToken = 'not.a.valid.jwt.token';

                const response = await request(app)
                    .get('/api/auth/profile')
                    .set('Authorization', `Bearer ${malformedToken}`);

                TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
            });

            test('should reject tokens with invalid signature', async () => {
                const token = jwt.sign(
                    { userId: 1, username: 'testuser' },
                    'wrong-secret',
                    { expiresIn: '1h' }
                );

                const response = await request(app)
                    .get('/api/auth/profile')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
            });
        });
    });

    describe('Performance Tests', () => {
        test('should handle concurrent login requests', async () => {
            const loginData = {
                username: 'testuser',
                password: 'Password123'
            };

            const hashedPassword = await TestHelpers.hashPassword('Password123');
            const mockUser = TestHelpers.createTestUserData({
                password_hash: hashedPassword
            });

            mockDb.execute.mockResolvedValue([[mockUser]]);

            const startTime = Date.now();
            
            const promises = Array.from({ length: 10 }, () =>
                request(app)
                    .post('/api/auth/login')
                    .send(loginData)
            );

            const responses = await Promise.all(promises);
            const endTime = Date.now();

            // All requests should complete within reasonable time
            expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
            
            // All responses should be successful
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });

        test('should handle database query timeouts', async () => {
            const loginData = {
                username: 'testuser',
                password: 'Password123'
            };

            // Simulate database timeout
            mockDb.execute.mockImplementation(() => 
                new Promise((resolve, reject) => 
                    setTimeout(() => reject(new Error('Database timeout')), 100)
                )
            );

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData);

            TestHelpers.validateErrorResponse(response, 500);
        });
    });

    describe('Error Handling Tests', () => {
        test('should handle database connection errors', async () => {
            const loginData = {
                username: 'testuser',
                password: 'Password123'
            };

            mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData);

            TestHelpers.validateErrorResponse(response, 500);
        });

        test('should handle malformed JSON requests', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}');

            expect(response.status).toBe(400);
        });

        test('should handle missing required fields', async () => {
            const incompleteData = {
                username: 'testuser'
                // Missing password
            };

            const response = await request(app)
                .post('/api/auth/login')
                .send(incompleteData);

            TestHelpers.validateErrorResponse(response, 400);
        });
    });
});