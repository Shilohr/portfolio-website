const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
 * Performs timing-safe string comparison using HMAC
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} True if strings match, false otherwise
 */
const timingSafeEqual = (a, b) => {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Generates a JWT token for authenticated user
 * @param {number} userId - User's unique identifier
 * @param {string} username - User's username
 * @param {string} role - User's role (e.g., 'admin', 'user')
 * @returns {Object} Object containing token and jti
 */
const generateToken = (userId, username, role) => {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in generateToken');
    }
    const jti = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
        { userId, username, role, jti },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
    return { token, jti };
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
            const userResult = await connection.execute(
                'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                [username, email, passwordHash]
            );

            // Handle both MySQL-compatible tuples and JSON adapter return shape
            let insertId;
            
            if (Array.isArray(userResult)) {
                // MySQL adapter returns [rows, metadata] where metadata has insertId
                insertId = userResult[0]?.insertId || userResult[1]?.insertId;
            } else if (userResult && typeof userResult === 'object') {
                // JSON adapter might return { insertId: ... } or { id: ... } or { lastID: ... }
                insertId = userResult.insertId || userResult.id || userResult.lastID;
            }
            
            // Validate that we have a valid insertId
            if (insertId === undefined || insertId === null) {
                throw new Error('Failed to retrieve user ID after insertion - database adapter returned invalid result');
            }

            // Log registration
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [insertId, 'USER_REGISTERED', req.ip, req.get('User-Agent')]
            );
            
            logger.audit('USER_REGISTERED', req, 'user', { 
                userId: insertId, 
                username,
                email 
            });

            return {
                userId: insertId,
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
            requestBody: { username, email }
        });
        sendError(res, 'DATABASE_ERROR', 'Registration failed');
    }
});

// Test route without database
router.post('/login-test', async (req, res) => {
    try {
        logger.info('Login test route hit', req, { body: { username: req.body?.username } });
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
                'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?',
                [new Date(), user.id]
            );

            // Generate JWT token with jti
            const { token, jti } = generateToken(user.id, user.username, user.role);

            // Store session in database with jti for fast lookup
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await connection.execute(
                'INSERT INTO user_sessions (user_id, token_hash, jti, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
                [user.id, tokenHash, jti, new Date(Date.now() + 24 * 60 * 60 * 1000), req.ip, req.get('User-Agent')]
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
            requestBody: { username: req.body?.username || 'unknown' }
        });
        sendError(res, 'DATABASE_ERROR', 'Login failed');
    }
});

router.post('/logout', async (req, res) => {
    const token = req.cookies.portfolio_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return sendError(res, 'VALIDATION_ERROR', 'No token provided');
    }

    let decoded;
    try {
        // Decode token to get user info - separate JWT verification from database operations
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        // Handle JWT-specific errors separately
        if (error.name === 'JsonWebTokenError') {
            return sendError(res, 'UNAUTHORIZED', 'Invalid token');
        } else if (error.name === 'TokenExpiredError') {
            return sendError(res, 'FORBIDDEN', 'Token expired');
        } else {
            logger.error('Unexpected JWT verification error', req, { 
                error: error.message
            });
            return sendError(res, 'INTERNAL_ERROR', 'Token verification failed');
        }
    }

    try {
        const db = req.db;

        let sessionToInvalidate = null;

        // Check if token has jti (new format) or fallback to old method
        if (decoded.jti) {
            // New fast method using jti
            const [sessions] = await db.execute(
                'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND jti = ? AND is_active = 1 AND expires_at > ?',
                [decoded.userId, decoded.jti, new Date()]
            );
            
            if (sessions.length > 0) {
                const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
                const isValid = timingSafeEqual(tokenHash, sessions[0].token_hash);
                if (isValid) {
                    sessionToInvalidate = sessions[0];
                }
            }
        } else {
            // Fallback for old tokens - use the old expensive method
            const [sessions] = await db.execute(
                'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND is_active = 1 AND expires_at > ?',
                [decoded.userId, new Date()]
            );

            // Find the session that matches our token
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            for (const session of sessions) {
                const isValid = timingSafeEqual(tokenHash, session.token_hash);
                if (isValid) {
                    sessionToInvalidate = session;
                    break;
                }
            }
        }

        // Invalidate the matching session
        if (sessionToInvalidate) {
            await db.execute(
                'UPDATE user_sessions SET is_active = 0, expires_at = ? WHERE id = ?',
                [new Date(), sessionToInvalidate.id]
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
        // This catch block now only handles genuine database/storage failures
        logger.error('Logout database operation failed', req, { 
            error: error.message
        });
        sendError(res, 'DATABASE_ERROR', 'Logout failed due to storage error');
    }
});

/**
 * Middleware to verify JWT token and authenticate user
 * Uses jti for fast, constant-time session lookup
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

        // Check if token has jti (new format) or fallback to old method
        if (!decoded.jti) {
            // Fallback for old tokens - use the old expensive method
            try {
                const db = req.db;
                const [sessions] = await db.execute(
                    'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND is_active = 1 AND expires_at > ?',
                    [decoded.userId, new Date()]
                );

                if (sessions.length === 0) {
                    return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
                }

                // Verify token hash against stored hash
                let validSession = null;
                const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
                for (const session of sessions) {
                    const isValid = timingSafeEqual(tokenHash, session.token_hash);
                    if (isValid) {
                        validSession = session;
                        break;
                    }
                }

                if (!validSession) {
                    return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
                }

                // Revalidate user status to prevent disabled user bypass
                const [users] = await db.execute(
                    'SELECT is_active, role FROM users WHERE id = ?',
                    [decoded.userId]
                );

                if (users.length === 0) {
                    return sendError(res, 'FORBIDDEN', 'User not found');
                }

                const currentUser = users[0];
                if (!currentUser.is_active) {
                    return sendError(res, 'FORBIDDEN', 'Account is deactivated');
                }

                // Update user object with current role
                req.user = {
                    ...decoded,
                    role: currentUser.role
                };
                next();
            } catch (error) {
                logger.error('Token validation failed (fallback)', req, { 
                    error: error.message
                });
                sendError(res, 'DATABASE_ERROR', 'Token validation failed');
            }
            return;
        }

        // New fast method using jti
        try {
            const db = req.db;
            const [sessions] = await db.execute(
                'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND jti = ? AND is_active = 1 AND expires_at > ?',
                [decoded.userId, decoded.jti, new Date()]
            );

            if (sessions.length === 0) {
                return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
            }

            const session = sessions[0];

            // Verify token against stored hash
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const isValid = timingSafeEqual(tokenHash, session.token_hash);

            if (!isValid) {
                return sendError(res, 'FORBIDDEN', 'Session expired or invalid');
            }

            // Revalidate user status to prevent disabled user bypass
            const [users] = await db.execute(
                'SELECT is_active, role FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (users.length === 0) {
                return sendError(res, 'FORBIDDEN', 'User not found');
            }

            const currentUser = users[0];
            if (!currentUser.is_active) {
                return sendError(res, 'FORBIDDEN', 'Account is deactivated');
            }

            // Update user object with current role
            req.user = {
                ...decoded,
                role: currentUser.role
            };
            req.sessionId = session.id;
            next();
        } catch (error) {
            logger.error('Token validation failed', req, { 
                error: error.message
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
        // Filter sensitive headers and cookies to prevent security leaks
        const filteredHeaders = { ...req.headers };
        const sensitiveHeaders = ['cookie', 'authorization', 'x-csrf-token', 'x-api-key'];
        
        sensitiveHeaders.forEach(header => {
            delete filteredHeaders[header];
        });
        
        // Filter sensitive cookies
        const filteredCookies = { ...req.cookies };
        delete filteredCookies.portfolio_token;
        delete filteredCookies._csrf;

        sendSuccess(res, {
            user: req.user,
            headers: filteredHeaders,
            cookies: filteredCookies
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
            error: error.message
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch profile');
    }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;