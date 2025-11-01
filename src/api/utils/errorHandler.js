const { logger } = require('./logger');

/**
 * Creates a standardized error response object
 * @param {string} message - Human-readable error message
 * @param {string} code - Machine-readable error code (default: 'INTERNAL_ERROR')
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Object|null} details - Additional error details (default: null)
 * @returns {Object} Standardized error response object
 */
const createErrorResponse = (message, code = 'INTERNAL_ERROR', statusCode = 500, details = null) => {
    return {
        success: false,
        error: {
            message,
            code,
            timestamp: new Date().toISOString(),
            ...(details && { details })
        }
    };
};

/**
 * Creates a standardized success response object
 * @param {*} data - Response data payload
 * @param {string} message - Success message (default: 'Success')
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Standardized success response object
 */
const createSuccessResponse = (data, message = 'Success', statusCode = 200) => {
    return {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
};

// Common error codes and their responses
const ERROR_RESPONSES = {
    VALIDATION_ERROR: {
        message: 'Validation failed',
        statusCode: 400,
        code: 'VALIDATION_ERROR'
    },
    UNAUTHORIZED: {
        message: 'Authentication required',
        statusCode: 401,
        code: 'UNAUTHORIZED'
    },
    FORBIDDEN: {
        message: 'Access denied',
        statusCode: 403,
        code: 'FORBIDDEN'
    },
    NOT_FOUND: {
        message: 'Resource not found',
        statusCode: 404,
        code: 'NOT_FOUND'
    },
    CONFLICT: {
        message: 'Resource already exists',
        statusCode: 409,
        code: 'CONFLICT'
    },
    RATE_LIMIT: {
        message: 'Too many requests',
        statusCode: 429,
        code: 'RATE_LIMIT'
    },
    CSRF_INVALID: {
        message: 'Invalid CSRF token',
        statusCode: 403,
        code: 'CSRF_INVALID'
    },
    DATABASE_ERROR: {
        message: 'Database operation failed',
        statusCode: 500,
        code: 'DATABASE_ERROR'
    },
    EXTERNAL_API_ERROR: {
        message: 'External service unavailable',
        statusCode: 502,
        code: 'EXTERNAL_API_ERROR'
    },
    DEBUG_ERROR: {
        message: 'Debug operation failed',
        statusCode: 500,
        code: 'DEBUG_ERROR'
    },
    CONFIG_ERROR: {
        message: 'Configuration error',
        statusCode: 500,
        code: 'CONFIG_ERROR'
    },
    TIMEOUT: {
        message: 'Request timeout',
        statusCode: 408,
        code: 'TIMEOUT'
    },
    INTERNAL_ERROR: {
        message: 'Internal server error',
        statusCode: 500,
        code: 'INTERNAL_ERROR'
    }
};

/**
 * Express error handler middleware for consistent error responses
 * Handles different error types with appropriate HTTP status codes and logging
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
    // Log the error with context
    logger.error('Request error', req, {
        error: err.message,
        stack: err.stack,
        name: err.name,
        code: err.code
    });

    // Handle specific error types with consistent responses
    if (err.name === 'ValidationError') {
        const validationErrors = err.errors || [];
        return res.status(400).json(
            createErrorResponse(
                'Validation failed',
                'VALIDATION_ERROR',
                400,
                { validationErrors }
            )
        );
    }

    if (err.code === 'EBADCSRFTOKEN') {
        logger.security('CSRF_TOKEN_INVALID', req, 'high', {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            path: req.path
        });
        return res.status(403).json(
            createErrorResponse(
                'Invalid CSRF token',
                'CSRF_INVALID',
                403
            )
        );
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json(
            createErrorResponse(
                'File too large',
                'FILE_TOO_LARGE',
                413
            )
        );
    }

    // Handle JWT authentication errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json(
            createErrorResponse(
                'Invalid authentication token',
                'INVALID_TOKEN',
                401
            )
        );
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json(
            createErrorResponse(
                'Authentication token expired',
                'TOKEN_EXPIRED',
                401
            )
        );
    }

    // Default error response with environment-specific details
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorResponse = createErrorResponse(
        isDevelopment ? err.message : 'Internal server error',
        'INTERNAL_ERROR',
        500,
        isDevelopment ? { stack: err.stack } : null
    );

    res.status(500).json(errorResponse);
};

/**
 * Higher-order function to wrap async route handlers and catch errors
 * Prevents unhandled promise rejections in Express routes
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Sends a standardized error response using predefined error configurations
 * @param {Object} res - Express response object
 * @param {string} errorKey - Key from ERROR_RESPONSES object
 * @param {string|null} customMessage - Optional custom error message
 * @param {Object|null} details - Optional additional error details
 */
const sendError = (res, errorKey, customMessage = null, details = null) => {
    const errorConfig = ERROR_RESPONSES[errorKey] || ERROR_RESPONSES.DATABASE_ERROR;
    const message = customMessage || errorConfig.message;
    
    res.status(errorConfig.statusCode).json(
        createErrorResponse(message, errorConfig.code, errorConfig.statusCode, details)
    );
};

/**
 * Sends a standardized success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data payload
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
    res.status(statusCode).json(createSuccessResponse(data, message, statusCode));
};

module.exports = {
    createErrorResponse,
    createSuccessResponse,
    errorHandler,
    asyncHandler,
    sendError,
    sendSuccess,
    ERROR_RESPONSES
};