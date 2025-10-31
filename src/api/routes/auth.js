const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { sendError, sendSuccess, createErrorResponse } = require('../utils/errorHandler');
const { commonValidations, handleValidationErrors } = require('../utils/validation');
const { cache } = require('../utils/cache');
const { createTransactionManager } = require('../utils/transaction');
const router = express.Router();

// Always ensure JWT_SECRET exists
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
    } else {
        // Use a more secure default for development
        const crypto = require('crypto');
        process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    }
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Input validation middleware
const validateLogin = [
    commonValidations.loginUsername,
    commonValidations.loginPassword
];

const validateRegister = [
    commonValidations.registerUsername,
    commonValidations.email,
    commonValidations.registerPassword
];

/**
 * Authentication helper functions for secure user management
 */

/**
 * Checks if a user account is currently locked due to failed login attempts
 * @param {Object} user - User object containing locked_until timestamp
 * @returns {boolean} True if account is locked, false otherwise
 */
const isAccountLocked = (user) => {
    return user.locked_until && user.locked_until > Date.now();
};

/**
 * Hashes a password using bcrypt with secure salt rounds
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password string
 */
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 12);
};

/**
 * Compares a plain text password against a bcrypt hash
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 */
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

/**
 * Generates a JWT token for authenticated user
 * @param {number} userId - User's unique identifier
 * @param {string} username - User's username
 * @param {string} role - User's role (e.g., 'admin', 'user')
 * @returns {string} JWT token string
 */
const generateToken = (userId, username, role) => {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in generateToken');
    }
    return jwt.sign(
        { userId, username, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Routes
router.post('/register', validateRegister, handleValidationErrors, async (req, res) => {
    // Extract variables outside try block for error logging access
    const { username, email, password } = req.body;
    const db = req.db;

    try {

        // Check if user already exists
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return sendError(res, 'CONFLICT', 'Username or email already exists');
        }

        // Use transaction manager
        const transactionManager = createTransactionManager(db);
        
        const result = await transactionManager.execute(async (connection) => {
            // Hash password and create user
            const passwordHash = await hashPassword(password);
            const [userResult] = await connection.execute(
                'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                [username, email, passwordHash]
            );

            // Log registration
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [userResult.insertId, 'USER_REGISTERED', req.ip, req.get('User-Agent')]
            );
            
            logger.audit('USER_REGISTERED', req, 'user', { 
                userId: userResult.insertId, 
                username,
                email 
            });

            return {
                userId: userResult.insertId,
                username,
                email
            };
        });

        // Clear user-related cache
        cache.invalidatePattern('user:.*');

        sendSuccess(res, result, 'User registered successfully', 201);

    } catch (error) {
        logger.error('Registration failed', req, { 
            error: error.message,
            stack: error.stack,
            requestBody: { username, email }
        });
        sendError(res, 'DATABASE_ERROR', 'Registration failed');
    }
});

// Test route without database
router.post('/login-test', async (req, res) => {
    try {
        logger.info('Login test route hit', req, { body: req.body });
        res.json({ success: true, message: 'Test route works' });
    } catch (error) {
        logger.error('Login test failed', req, { error: error.message });
        res.status(500).json({ error: 'Test failed' });
    }
});

// Login route
router.post('/login', validateLogin, handleValidationErrors, async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = req.db;

        // Get user from database
        const [users] = await db.execute(
            'SELECT id, username, email, password_hash, role, is_active, login_attempts, locked_until FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (users.length === 0) {
            logger.security('LOGIN_ATTEMPT_INVALID_USER', req, 'medium', { 
                username,
                reason: 'User not found'
            });
            return sendError(res, 'UNAUTHORIZED', 'Invalid credentials');
        }

        const user = users[0];

        // Check if account is locked
        if (isAccountLocked(user)) {
            logger.security('LOGIN_ATTEMPT_LOCKED_ACCOUNT', req, 'high', { 
                userId: user.id,
                username: user.username,
                lockedUntil: user.locked_until
            });
            return sendError(res, 'FORBIDDEN', 'Account temporarily locked due to too many failed attempts', {
                lockedUntil: user.locked_until,
                retryAfter: Math.ceil((user.locked_until - Date.now()) / 1000)
            });
        }

        // Check if account is active
        if (!user.is_active) {
            return sendError(res, 'FORBIDDEN', 'Account is deactivated');
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password_hash);
        if (!isValidPassword) {
            // Increment login attempts
            const newAttempts = user.login_attempts + 1;
            const lockedUntil = newAttempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCK_TIME : null;

            // Update login attempts using parameterized queries for JSON adapter compatibility
            await db.execute('UPDATE users SET login_attempts = ? WHERE id = ?', [newAttempts, user.id]);
            if (lockedUntil) {
                await db.execute('UPDATE users SET locked_until = ? WHERE id = ?', [lockedUntil, user.id]);
            }

            logger.security('LOGIN_ATTEMPT_INVALID_PASSWORD', req, newAttempts >= MAX_LOGIN_ATTEMPTS ? 'high' : 'medium', { 
                userId: user.id,
                username: user.username,
                attempts: newAttempts,
                maxAttempts: MAX_LOGIN_ATTEMPTS,
                accountLocked: lockedUntil !== null
            });

            return sendError(res, 'UNAUTHORIZED', 'Invalid credentials');
        }

        // Use database transaction for atomic operations
        let connection;
        try {
            // Check if db is already a connection or if it's a pool
            if (typeof db.execute === 'function' && typeof db.getConnection === 'function') {
                // This is a pool, get a connection
                connection = await db.getConnection();
            } else if (typeof db.execute === 'function') {
                // This is already a connection, use it directly
                connection = db;
            } else {
                throw new Error('Invalid database object: must be a pool or connection');
            }
            
            await connection.beginTransaction();
            
            // Reset login attempts on successful login
            await connection.execute(
                'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );

            // Generate JWT token
            const token = generateToken(user.id, user.username, user.role);

            // Store session in database
            const tokenHash = await hashPassword(token);
            await connection.execute(
                'INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                [user.id, tokenHash, new Date(Date.now() + 24 * 60 * 60 * 1000), req.ip, req.get('User-Agent')]
            );

            // Log successful login
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [user.id, 'USER_LOGIN', req.ip, req.get('User-Agent')]
            );
            
            logger.audit('USER_LOGIN', req, 'user', { 
                userId: user.id, 
                username: user.username 
            });

            await connection.commit();
            
            const result = {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            };

            // Clear user-related cache
            cache.invalidatePattern('user:.*');
            cache.invalidatePattern('auth:.*');

            // Set httpOnly cookie with token
            res.cookie('portfolio_token', result.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                path: '/'
            });

            sendSuccess(res, result.user, 'Login successful');
            
        } catch (error) {
            // Only rollback if connection exists and has a transaction
            if (connection && typeof connection.rollback === 'function') {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    logger.error('Failed to rollback transaction', req, { 
                        rollbackError: rollbackError.message,
                        originalError: error.message
                    });
                }
            }
            throw error;
        } finally {
            // Only release if we got the connection from a pool
            if (connection !== db && typeof connection.release === 'function') {
                connection.release();
            }
        }

    } catch (error) {
logger.error('Login failed', req, { 
            error: error.message,
            stack: error.stack,
            requestBody: { username: req.body?.username || 'unknown' }
        });
        sendError(res, 'DATABASE_ERROR', 'Login failed');
    }
});

router.post('/logout', async (req, res) => {
    try {
        const token = req.cookies.portfolio_token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            return sendError(res, 'VALIDATION_ERROR', 'No token provided');
        }

        // Decode token to get user info
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = req.db;

        // Get active sessions for user and find matching token
        const [sessions] = await db.execute(
            'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
            [decoded.userId]
        );

        // Find the session that matches our token
        let sessionToInvalidate = null;
        for (const session of sessions) {
            const isValid = await comparePassword(token, session.token_hash);
            if (isValid) {
                sessionToInvalidate = session;
                break;
            }
        }

        // Invalidate the matching session
        if (sessionToInvalidate) {
            await db.execute(
                'UPDATE user_sessions SET is_active = FALSE WHERE id = ?',
                [sessionToInvalidate.id]
            );
        }

        // Log logout
        await db.execute(
            'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [decoded.userId, 'USER_LOGOUT', req.ip, req.get('User-Agent')]
        );
        
        logger.audit('USER_LOGOUT', req, 'user', { 
            userId: decoded.userId,
            username: decoded.username
        });

        // Clear auth cookie and CSRF cookie on logout
        res.clearCookie('portfolio_token', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        res.clearCookie('_csrf', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        sendSuccess(res, null, 'Logout successful');

    } catch (error) {
        logger.error('Logout failed', req, { 
            error: error.message,
            stack: error.stack
        });
        sendError(res, 'DATABASE_ERROR', 'Logout failed');
    }
});

/**
 * Middleware to verify JWT token and authenticate user
 * Checks token validity against database sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void} Calls next() if valid, sends error response if invalid
 */
const authenticateToken = (req, res, next) => {
    const token = req.cookies.portfolio_token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
        return sendError(res, 'UNAUTHORIZED', 'Access token required');
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return sendError(res, 'FORBIDDEN', 'Invalid or expired token');
        }

        try {
            const db = req.db;
            const [sessions] = await db.execute(
                'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
                [decoded.userId]
            );

            if (sessions.length === 0) {
                return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
            }

            // Verify token hash against stored hash
            let validSession = null;
            for (const session of sessions) {
                const isValid = await comparePassword(token, session.token_hash);
                if (isValid) {
                    validSession = session;
                    break;
                }
            }

            if (!validSession) {
                return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
            }

            req.user = decoded;
            next();
        } catch (error) {
            logger.error('Token validation failed', req, { 
                error: error.message,
                stack: error.stack
            });
            sendError(res, 'DATABASE_ERROR', 'Token validation failed');
        }
    });
};

/**
 * Middleware to verify admin privileges
 * Must be used after authenticateToken
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void} Calls next() if admin, sends error response if not
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required');
    }

    if (req.user.role !== 'admin') {
        logger.warn('Unauthorized admin access attempt', req, {
            userId: req.user.userId,
            userRole: req.user.role,
            attemptedPath: req.originalUrl
        });
        return sendError(res, 'FORBIDDEN', 'Admin privileges required');
    }

    next();
};

// Debug route to check current authentication status
router.get('/debug', authenticateToken, async (req, res) => {
    try {
        sendSuccess(res, {
            user: req.user,
            headers: req.headers,
            cookies: req.cookies
        }, 'Authentication debug info');
    } catch (error) {
        sendError(res, 'DEBUG_ERROR', 'Failed to get debug info');
    }
});

// Protected route example
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const [users] = await db.execute(
            'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return sendError(res, 'NOT_FOUND', 'User not found');
        }

        sendSuccess(res, { user: users[0] }, 'Profile fetched successfully');
    } catch (error) {
        logger.error('Failed to fetch profile', req, { 
            error: error.message,
            stack: error.stack
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch profile');
    }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;