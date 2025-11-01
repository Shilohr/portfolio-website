const { body, param, query, validationResult } = require('express-validator');

// Common validation chains
const commonValidations = {
    // ID parameter validation
    id: param('id')
        .trim()
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer'),
    
    // Pagination validations
    page: query('page')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Page must be between 1 and 1000'),
    
    limit: query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    // String validations
    title: body('title')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Title must be 1-200 characters')
        .matches(/^[a-zA-Z0-9\s\-_.,!?()]+$/)
        .withMessage('Title contains invalid characters'),
    
    description: body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description must be max 1000 characters')
        .escape(),
    
    // URL validations
    githubUrl: body('github_url')
        .optional()
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Valid GitHub URL required')
        .matches(/^https:\/\/github\.com\//)
        .withMessage('Must be a GitHub URL'),
    
    liveUrl: body('live_url')
        .optional()
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Valid live URL required'),
    
    // Boolean validations
    boolean: (fieldName) => body(fieldName)
        .optional()
        .isBoolean()
        .withMessage(`${fieldName} must be a boolean`),
    
    // Array validations
    technologies: body('technologies')
        .optional()
        .isArray()
        .withMessage('Technologies must be an array'),
    
    technology: body('technologies.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .matches(/^[a-zA-Z0-9\s\-_+.]+$/)
        .withMessage('Technology contains invalid characters'),
    
    // Status validation
    status: body('status')
        .optional()
        .isIn(['active', 'archived', 'draft'])
        .withMessage('Status must be active, archived, or draft'),
    
    // GitHub specific validations
    githubUsername: body('username')
        .optional()
        .trim()
        .isLength({ min: 1, max: 39 })
        .withMessage('Username must be 1-39 characters')
        .matches(/^[a-zA-Z0-9\-]+$/)
        .withMessage('Username contains invalid characters'),
    
    repoId: param('repoId')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Repository ID is required')
        .matches(/^[a-zA-Z0-9\-_\.]+$/)
        .withMessage('Repository ID contains invalid characters'),
    
    language: query('language')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Language must be 1-50 characters')
        .matches(/^[a-zA-Z0-9\s\-_+.]+$/)
        .withMessage('Language contains invalid characters'),
    
    sort: query('sort')
        .optional()
        .isIn(['stars', 'updated', 'name'])
        .withMessage('Sort must be stars, updated, or name'),
    
    // Auth validations
    loginUsername: body('username')
        .trim()
        .isLength({ min: 3 })
        .withMessage('Username must be at least 3 characters'),
    
    loginPassword: body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    
    registerUsername: body('username')
        .trim()
        .isLength({ min: 3 })
        .isAlphanumeric()
        .withMessage('Username must be alphanumeric'),
    
    email: body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email required'),
    
    registerPassword: body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
    
    // Admin maintenance validations
    maintenanceOperation: body('operation')
        .isIn(['cleanup-sessions', 'optimize-tables', 'create-partition', 'drop-old-partitions', 'metrics'])
        .withMessage('Invalid operation'),
    
    // Admin cache management validations
    cacheOperation: body('operation')
        .isIn(['clear', 'invalidate', 'stats'])
        .withMessage('Invalid cache operation'),
    
    year: body('year')
        .optional()
        .isInt({ min: new Date().getFullYear(), max: new Date().getFullYear() + 10 })
        .withMessage('Year must be between current year and current year + 10'),
    
    yearsToKeep: body('yearsToKeep')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Years to keep must be between 1 and 10')
};

// Validation result handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const { createErrorResponse } = require('./errorHandler');
        return res.status(400).json(
            createErrorResponse(
                'Validation failed',
                'VALIDATION_ERROR',
                400,
                { validationErrors: errors.array() }
            )
        );
    }
    next();
};

// Sanitization helpers
const sanitizers = {
    // Sanitize and validate page number
    sanitizePage: (page) => {
        const pageNum = Math.max(1, parseInt(page) || 1);
        return Math.min(1000, pageNum);
    },
    
    // Sanitize and validate limit number
    sanitizeLimit: (limit) => {
        const limitNum = Math.max(1, parseInt(limit) || 20);
        return Math.min(100, limitNum);
    },
    
    // Sanitize string array
    sanitizeStringArray: (arr, maxLength = 50) => {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(item => item && typeof item === 'string')
            .map(item => item.trim().substring(0, maxLength))
            .filter(item => item.length > 0);
    },
    
    // Sanitize single string
    sanitizeString: (str, maxLength = 255) => {
        if (!str || typeof str !== 'string') return '';
        return str.trim().substring(0, maxLength);
    },
    
    // Validate GitHub username format
    isValidGitHubUsername: (username) => {
        return /^[a-zA-Z0-9\-]+$/.test(username) && username.length >= 1 && username.length <= 39;
    },
    
    // Validate repository ID format
    isValidRepoId: (repoId) => {
        return /^[a-zA-Z0-9\-_\.]+$/.test(repoId) && repoId.length >= 1 && repoId.length <= 50;
    }
};

// Custom validation middleware
const customValidations = {
    // Validate user ID parameter
    validateUserId: (req, res, next) => {
        const { id } = req.params;
        if (!/^\d+$/.test(id)) {
            const { sendError } = require('./errorHandler');
            return sendError(res, 'VALIDATION_ERROR', 'Invalid user ID format');
        }
        next();
    },
    
    // Validate project ID parameter
    validateProjectId: (req, res, next) => {
        const { id } = req.params;
        if (!/^\d+$/.test(id)) {
            const { sendError } = require('./errorHandler');
            return sendError(res, 'VALIDATION_ERROR', 'Invalid project ID format');
        }
        next();
    },
    
    // Validate query parameters for filtering
    validateFilterParams: (req, res, next) => {
        const { featured, status, user_id } = req.query;
        
        // Validate featured parameter
        if (featured && !['true', 'false'].includes(featured)) {
            const { sendError } = require('./errorHandler');
            return sendError(res, 'VALIDATION_ERROR', 'Featured parameter must be true or false');
        }
        
        // Validate status parameter
        if (status) {
            const validStatuses = ['active', 'archived', 'draft'];
            if (!validStatuses.includes(status)) {
                const { sendError } = require('./errorHandler');
                return sendError(res, 'VALIDATION_ERROR', 'Status must be active, archived, or draft');
            }
        }
        
        // Validate user_id parameter
        if (user_id && !/^\d+$/.test(user_id)) {
            const { sendError } = require('./errorHandler');
            return sendError(res, 'VALIDATION_ERROR', 'User ID must be a valid integer');
        }
        
        next();
    }
};

module.exports = {
    commonValidations,
    handleValidationErrors,
    sanitizers,
    customValidations
};