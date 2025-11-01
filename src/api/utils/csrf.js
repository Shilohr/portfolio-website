const csrf = require('csurf');
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

// Smart CSRF protection that bypasses for token-authenticated requests
const smartCsrfProtection = (req, res, next) => {
    // Skip CSRF protection if:
    // 1. Request has Authorization header (Bearer token)
    // 2. Running in test environment
    // 3. Request method is safe (GET, HEAD, OPTIONS)
    const hasAuthHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ');
    const isTestEnvironment = process.env.NODE_ENV === 'test';
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    
    if (hasAuthHeader || isTestEnvironment || isSafeMethod) {
        if (hasAuthHeader) {
            logger.debug('CSRF bypassed for authenticated request', req, {
                reason: 'Authorization header present',
                path: req.path,
                method: req.method
            });
        }
        if (isTestEnvironment) {
            logger.debug('CSRF bypassed in test environment', req, {
                reason: 'Test environment',
                path: req.path,
                method: req.method
            });
        }
        return next();
    }
    
    // Apply CSRF protection for browser-based requests
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