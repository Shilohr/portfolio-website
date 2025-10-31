const csrf = require('csurf');
const { logger } = require('./logger');
const { sendError } = require('./errorHandler');

// CSRF protection configuration
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

// CSRF token middleware for API routes
const csrfTokenMiddleware = (req, res, next) => {
    // Apply CSRF to all state-changing operations
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return csrfProtection(req, res, next);
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
    csrfTokenMiddleware,
    getCsrfToken,
    csrfErrorHandler
};