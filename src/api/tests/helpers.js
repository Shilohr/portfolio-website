const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

/**
 * Test utilities and helper functions
 */
class TestHelpers {
    /**
     * Create a mock Express app with routes
     */
    static createMockApp(routes, middleware = [], mockDb = null) {
        const express = require('express');
        const cookieParser = require('cookie-parser');
        const csrf = require('csurf');
        const app = express();
        
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
        
        // Add custom middleware
        middleware.forEach(mw => app.use(mw));
        
        // Add database middleware with injected mockDb or default
        app.use((req, res, next) => {
            req.db = mockDb || this.getMockDb();
            next();
        });
        
        // Add routes with proper prefixes
        routes.forEach(route => {
            if (typeof route === 'function') {
                // If it's just a function, mount it directly (assumes it handles its own prefix)
                app.use(route);
            } else if (route.path && route.handler) {
                // Mount with specified path prefix
                app.use(route.path, route.handler);
            } else if (route.prefix && route.router) {
                // Mount with prefix and router (alternative format)
                app.use(route.prefix, route.router);
            }
        });
        
        return app;
    }

    /**
     * Get mock database object
     */
    static getMockDb(overrides = {}) {
        const mockConnection = {
            execute: jest.fn(),
            query: jest.fn(),
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            ...overrides.connection
        };
        
        const mockDb = {
            execute: jest.fn(),
            query: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            ...overrides.pool
        };
        
        // Set up default execute behavior to match real database adapters
        mockDb.execute.mockImplementation((sql, params = []) => {
            const trimmedSql = sql.trim().toUpperCase();
            if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
                // Return empty result set for SELECT queries by default
                return Promise.resolve([[]]);
            } else {
                // Return insert result for INSERT/UPDATE/DELETE queries by default
                return Promise.resolve([{
                    insertId: 1,
                    affectedRows: 1,
                    changedRows: 0
                }]);
            }
        });
        
        mockConnection.execute.mockImplementation((sql, params = []) => {
            const trimmedSql = sql.trim().toUpperCase();
            if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH')) {
                return Promise.resolve([]);
            } else {
                return Promise.resolve({
                    insertId: 1,
                    affectedRows: 1,
                    changedRows: 0
                });
            }
        });
        
        return mockDb;
    }

    /**
     * Generate test JWT token
     */
    static generateTestToken(userId = 1, username = 'testuser', role = 'developer') {
        return jwt.sign(
            { userId, username, role },
            process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only',
            { expiresIn: '1h' }
        );
    }

    /**
     * Generate expired test token
     */
    static generateExpiredToken(userId = 1, username = 'testuser', role = 'developer') {
        return jwt.sign(
            { userId, username, role },
            process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only',
            { expiresIn: '-1h' } // Expired 1 hour ago
        );
    }

    /**
     * Hash password for testing
     */
    static async hashPassword(password) {
        return await bcrypt.hash(password, 12);
    }

    /**
     * Create test user data
     */
    static createTestUserData(overrides = {}) {
        return {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            password_hash: 'hashedpassword',
            role: 'developer',
            is_active: true,
            login_attempts: 0,
            locked_until: null,
            created_at: new Date().toISOString(),
            last_login: null,
            ...overrides
        };
    }

    /**
     * Create test project data
     */
    static createTestProjectData(overrides = {}) {
        return {
            id: 1,
            title: 'Test Project',
            description: 'A test project description',
            github_url: 'https://github.com/test/repo',
            live_url: 'https://example.com',
            featured: false,
            status: 'active',
            order_index: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            technologies: ['JavaScript', 'Node.js'],
            ...overrides
        };
    }

    /**
     * Create test GitHub repository data
     */
    static createTestGitHubRepoData(overrides = {}) {
        return {
            id: 1,
            repo_id: '123456',
            name: 'test-repo',
            full_name: 'testuser/test-repo',
            description: 'A test repository',
            html_url: 'https://github.com/testuser/test-repo',
            stars: 10,
            forks: 5,
            language: 'JavaScript',
            topics: JSON.stringify(['node', 'express']),
            is_private: false,
            is_fork: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_sync: new Date().toISOString(),
            ...overrides
        };
    }

    /**
     * Mock authentication middleware
     */
    static mockAuth(userOverrides = {}) {
        return (req, res, next) => {
            req.user = {
                userId: 1,
                username: 'testuser',
                role: 'developer',
                ...userOverrides
            };
            next();
        };
    }

    /**
     * Mock rate limiting middleware
     */
    static mockRateLimit(options = {}) {
        return (req, res, next) => {
            if (options.shouldLimit) {
                return res.status(429).json({ error: 'Too many requests' });
            }
            next();
        };
    }

    /**
     * Create route configuration with proper prefix
     */
    static createRouteConfig(prefix, router) {
        return {
            prefix,
            router
        };
    }

    /**
     * Create a mock app that mirrors the real server setup
     */
    static createMockServer(authRoutes, projectsRoutes, githubRoutes, mockDb = null, middleware = []) {
        const routes = [
            this.createRouteConfig('/api/auth', authRoutes),
            this.createRouteConfig('/api/projects', projectsRoutes),
            this.createRouteConfig('/api/github', githubRoutes)
        ];
        
        return this.createMockApp(routes, middleware, mockDb);
    }

    /**
     * Create mock request object
     */
    static createMockRequest(overrides = {}) {
        return {
            body: {},
            params: {},
            query: {},
            headers: {},
            ip: '127.0.0.1',
            get: jest.fn((header) => {
                const headers = {
                    'user-agent': 'test-agent',
                    'authorization': 'Bearer test-token',
                    ...overrides.headers
                };
                return headers[header.toLowerCase()];
            }),
            ...overrides
        };
    }

    /**
     * Create mock response object
     */
    static createMockResponse() {
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            cookie: jest.fn().mockReturnThis(),
            clearCookie: jest.fn().mockReturnThis(),
            redirect: jest.fn().mockReturnThis(),
            end: jest.fn().mockReturnThis()
        };
        return res;
    }

    /**
     * Create mock next function
     */
    static createMockNext() {
        return jest.fn();
    }

    /**
     * Wait for async operations
     */
    static async wait(ms = 0) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate random test data
     */
    static generateRandomString(length = 10) {
        return Math.random().toString(36).substring(2, 2 + length);
    }

    /**
     * Generate random email
     */
    static generateRandomEmail() {
        return `test-${this.generateRandomString(8)}@example.com`;
    }

    /**
     * Generate random URL
     */
    static generateRandomUrl() {
        return `https://${this.generateRandomString(8)}.example.com`;
    }

    /**
     * Validate JWT token structure
     */
    static validateTokenStructure(token) {
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3); // Header, payload, signature
    }

    /**
     * Validate error response structure
     */
    static validateErrorResponse(response, expectedStatus, expectedMessage) {
        expect(response.status).toBe(expectedStatus);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('timestamp');
        if (expectedMessage) {
            expect(response.body.error.message).toContain(expectedMessage);
        }
    }

    /**
     * Validate success response structure
     */
    static validateSuccessResponse(response, expectedStatus = 200) {
        expect(response.status).toBe(expectedStatus);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).not.toHaveProperty('error');
    }

    /**
     * Validate pagination structure
     */
    static validatePagination(response, expectedPage = 1, expectedLimit = 20) {
        expect(response.body.data).toHaveProperty('pagination');
        const { pagination } = response.body.data;
        expect(pagination).toHaveProperty('page');
        expect(pagination).toHaveProperty('limit');
        expect(pagination).toHaveProperty('total');
        expect(pagination).toHaveProperty('pages');
        expect(pagination.page).toBe(expectedPage);
        expect(pagination.limit).toBe(expectedLimit);
    }

    /**
     * Clean up test data
     */
    static cleanup() {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    }

/**
     * Get CSRF token for testing
     */
    static async getCsrfToken(app) {
        const response = await request(app)
            .get('/api/csrf-token')
            .expect(200);
        
        return {
            token: response.body.csrfToken,
            cookies: response.headers['set-cookie']
        };
    }

    /**
     * Setup test environment
     */
    static setupTestEnv() {
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
    }

    /**
     * Mock console methods to avoid noise in tests
     */
    static mockConsole() {
        const originalConsole = { ...console };
        
        beforeEach(() => {
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
        });
    }

    /**
     * Test data factory for creating multiple test items
     */
    static createTestDataFactory(createFn) {
        return (count, overrides = {}) => {
            return Array.from({ length: count }, (_, index) => 
                createFn({ ...overrides, id: index + 1 })
            );
        };
    }
}

module.exports = TestHelpers;