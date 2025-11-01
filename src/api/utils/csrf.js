const csrf = require('csurf');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('./logger');
const { sendError } = require('./errorHandler');

// CSRF protection configuration
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// Helper function for timing-safe comparison
const timingSafeEqual = (a, b) => {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// Validate JWT token from Authorization header
const validateAuthorizationToken = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return false;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token has jti (new format) or fallback to old method
        if (!decoded.jti) {
            // Fallback for old tokens - use the old expensive method
            const db = req.db;
            const [sessions] = await db.execute(
                'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND is_active = 1 AND expires_at > ?',
                [decoded.userId, new Date()]
            );

            if (sessions.length === 0) {
                return false;
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
                return false;
            }

            // Revalidate user status to prevent disabled user bypass
            const [users] = await db.execute(
                'SELECT is_active, role FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (users.length === 0 || !users[0].is_active) {
                return false;
            }

            // Store user info for downstream middleware
            req.user = {
                ...decoded,
                role: users[0].role
            };
            return true;
        }

        // New fast method using jti
        const db = req.db;
        const [sessions] = await db.execute(
            'SELECT id, token_hash FROM user_sessions WHERE user_id = ? AND jti = ? AND is_active = 1 AND expires_at > ?',
            [decoded.userId, decoded.jti, new Date()]
        );

        if (sessions.length === 0) {
            return false;
        }

        const session = sessions[0];

        // Verify token against stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const isValid = timingSafeEqual(tokenHash, session.token_hash);

        if (!isValid) {
            return false;
        }

        // Revalidate user status to prevent disabled user bypass
        const [users] = await db.execute(
            'SELECT is_active, role FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0 || !users[0].is_active) {
            return false;
        }

        // Store user info for downstream middleware
        req.user = {
            ...decoded,
            role: users[0].role
        };
        req.sessionId = session.id;
        return true;
    } catch (error) {
        logger.debug('Authorization token validation failed', req, { 
            error: error.message 
        });
        return false;
    }
};

// Smart CSRF protection that bypasses for token-authenticated requests
const smartCsrfProtection = async (req, res, next) => {
    // Skip CSRF protection if:
    // 1. Request has valid Authorization header (Bearer token)
    // 2. Running in test environment
    // 3. Request method is safe (GET, HEAD, OPTIONS)
    const hasAuthHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ');
    const isTestEnvironment = process.env.NODE_ENV === 'test';
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    
    if (isTestEnvironment || isSafeMethod) {
        if (isTestEnvironment) {
            logger.debug('CSRF bypassed in test environment', req, {
                reason: 'Test environment',
                path: req.path,
                method: req.method
            });
        }
        return next();
    }
    
    if (hasAuthHeader) {
        // Validate the Authorization header token before bypassing CSRF
        const isValidToken = await validateAuthorizationToken(req);
        if (isValidToken) {
            logger.debug('CSRF bypassed for authenticated request', req, {
                reason: 'Valid Authorization token',
                path: req.path,
                method: req.method
            });
            return next();
        } else {
            logger.security('CSRF_BYPASS_ATTEMPT', req, 'medium', {
                reason: 'Invalid Authorization token',
                path: req.path,
                method: req.method,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });
        }
    }
    
    // Apply CSRF protection for browser-based requests or invalid tokens
    return csrfProtection(req, res, next);
};

// CSRF token middleware for API routes
const csrfTokenMiddleware = (req, res, next) => {
    // Apply smart CSRF to all state-changing operations
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return smartCsrfProtection(req, res, next);
    }
    next();
};

// Get CSRF token for client-side
const getCsrfToken = (req, res) => {
    try {
        const token = req.csrfToken();
        logger.info('CSRF token generated', req, { 
            endpoint: req.path,
            method: req.method 
        });
        res.json({ csrfToken: token });
    } catch (error) {
        logger.error('CSRF token generation failed', req, { 
            error: error.message 
        });
        sendError(res, 'INTERNAL_ERROR', 'Failed to generate CSRF token');
    }
};

// CSRF error handler
const csrfErrorHandler = (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        logger.security('CSRF_TOKEN_INVALID', req, 'high', {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        return res.status(403).json({ 
            error: 'Invalid CSRF token',
            code: 'CSRF_INVALID'
        });
    }
    next(err);
};

module.exports = {
    csrfProtection,
    smartCsrfProtection,
    csrfTokenMiddleware,
    getCsrfToken,
    csrfErrorHandler
};