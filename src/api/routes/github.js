const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { authenticateToken, requireAdmin } = require('./auth');

// Middleware to require admin or developer role
const requireAdminOrDeveloper = (req, res, next) => {
    if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required');
    }

    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
        logger.warn('Unauthorized access attempt', req, {
            userId: req.user.userId,
            userRole: req.user.role,
            attemptedPath: req.originalUrl
        });
        return sendError(res, 'FORBIDDEN', 'Admin or Developer privileges required');
    }

    next();
};
const { logger } = require('../utils/logger');
const { sendError, sendSuccess, createErrorResponse } = require('../utils/errorHandler');
const { commonValidations, handleValidationErrors, sanitizers } = require('../utils/validation');
const { cache } = require('../utils/cache');
const { createTransactionManager } = require('../utils/transaction');
const router = express.Router();

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'Shilohr';

/**
 * Rate limiting middleware for GitHub API endpoints
 * Limits requests to prevent abuse and stay within GitHub API limits
 * Uses user ID for authenticated users, IP address for anonymous requests
 */
const githubRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit each IP to 100 requests per hour
    message: {
        success: false,
        error: {
            message: 'Too many GitHub sync requests. Please try again later.',
            code: 'GITHUB_RATE_LIMIT',
            timestamp: new Date().toISOString()
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise IP
        return req.user ? `user:${req.user.userId}` : req.ip;
    }
});

// Input validation for sync endpoint
const validateSync = [
    commonValidations.boolean('force'),
    commonValidations.githubUsername
];

// Cache GitHub repositories (requires authentication and admin/developer privileges)
router.post('/sync', [
    authenticateToken,
    requireAdminOrDeveloper,
    githubRateLimiter,
    validateSync,
    handleValidationErrors
], async (req, res) => {
    const db = req.db;
    const { force = false, username } = req.body;
        
        // Use provided username or default
        const targetUsername = username && username.trim() ? username.trim() : GITHUB_USERNAME;
        
        try {
            // Log the sync attempt for security auditing
            logger.security('GITHUB_SYNC_ATTEMPT', req, 'medium', {
                targetUsername,
                force,
                userAgent: req.get('User-Agent')
            });
        
            // Prepare headers with optional authentication
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Portfolio-Website'
        };

        // Add Authorization header if GitHub token is provided and valid
        if (process.env.GITHUB_TOKEN && 
            process.env.GITHUB_TOKEN !== 'your-github-personal-access-token' && 
            process.env.GITHUB_TOKEN.trim() !== '') {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }
        
        // Validate username format using standardized sanitizer
        if (!sanitizers.isValidGitHubUsername(targetUsername)) {
            return sendError(res, 'VALIDATION_ERROR', 'Invalid GitHub username format');
        }

        // Fetch repositories from GitHub
        const response = await axios.get(`${GITHUB_API_BASE}/users/${targetUsername}/repos`, {
            headers
        });

        const repos = response.data;
        
        // Validate and sanitize repository payload
        if (!Array.isArray(repos)) {
            return sendError(res, 'EXTERNAL_API_ERROR', 'Invalid response format from GitHub API');
        }
        
        // Limit number of repositories to prevent database bloat
        const MAX_REPOS = 100;
        if (repos.length > MAX_REPOS) {
            logger.warn('GitHub API returned too many repositories, truncating', req, { 
                totalRepos: repos.length, 
                maxAllowed: MAX_REPOS 
            });
            repos.splice(MAX_REPOS);
        }
        
        // Validate each repository object structure
        const sanitizedRepos = repos.filter(repo => {
            return repo && 
                   typeof repo === 'object' &&
                   typeof repo.id === 'number' &&
                   typeof repo.name === 'string' &&
                   typeof repo.full_name === 'string' &&
                   (repo.description === null || repo.description === undefined || typeof repo.description === 'string') &&
                   typeof repo.html_url === 'string' &&
                   typeof repo.stargazers_count === 'number' &&
                   (repo.language === null || repo.language === undefined || typeof repo.language === 'string');
        });
        
        if (sanitizedRepos.length === 0) {
            return sendError(res, 'EXTERNAL_API_ERROR', 'No valid repositories found in GitHub response');
        }
        
        if (sanitizedRepos.length !== repos.length) {
            logger.warn('Some repositories were filtered out due to invalid structure', req, {
                originalCount: repos.length,
                validCount: sanitizedRepos.length
            });
        }
        
        // Use direct database operations to avoid transaction conflicts
        let syncedCount = 0;

        for (const repo of sanitizedRepos) {
            // Validate required fields
            if (!repo.id || !repo.name || !repo.full_name) {
                logger.warn('Skipping repository with missing required fields', req, { 
                    repo: repo.name || 'unknown' 
                });
                continue;
            }
            
            // Sanitize and limit field lengths
            const sanitizedRepo = {
                id: repo.id.toString(),
                name: (repo.name || '').substring(0, 255),
                full_name: (repo.full_name || '').substring(0, 255),
                description: (repo.description === null || repo.description === undefined ? '' : repo.description).substring(0, 1000),
                html_url: (repo.html_url || '').substring(0, 500),
                stargazers_count: Math.max(0, parseInt(repo.stargazers_count) || 0),
                forks_count: Math.max(0, parseInt(repo.forks_count) || 0),
                language: (repo.language === null || repo.language === undefined ? '' : repo.language).substring(0, 100),
                topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 20).map(t => String(t).substring(0, 50)) : [],
                private: Boolean(repo.private),
                fork: Boolean(repo.fork)
            };
            
            // Check if repo already exists
            const [existing] = await db.execute(
                'SELECT id FROM github_repos WHERE repo_id = ?',
                [sanitizedRepo.id]
            );

            if (existing.length === 0) {
                // Insert new repository
                await db.execute(`
                    INSERT INTO github_repos 
                    (repo_id, name, full_name, description, html_url, stars, forks, language, topics, is_private, is_fork)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    sanitizedRepo.id,
                    sanitizedRepo.name,
                    sanitizedRepo.full_name,
                    sanitizedRepo.description,
                    sanitizedRepo.html_url,
                    sanitizedRepo.stargazers_count,
                    sanitizedRepo.forks_count,
                    sanitizedRepo.language,
                    JSON.stringify(sanitizedRepo.topics),
                    sanitizedRepo.private,
                    sanitizedRepo.fork
                ]);
                syncedCount++;
            } else {
                // Update existing repository
                await db.execute(`
                    UPDATE github_repos 
                    SET name = ?, full_name = ?, description = ?, html_url = ?, 
                        stars = ?, forks = ?, language = ?, topics = ?, 
                        is_private = ?, is_fork = ?, last_sync = CURRENT_TIMESTAMP
                    WHERE repo_id = ?
                `, [
                    sanitizedRepo.name,
                    sanitizedRepo.full_name,
                    sanitizedRepo.description,
                    sanitizedRepo.html_url,
                    sanitizedRepo.stargazers_count,
                    sanitizedRepo.forks_count,
                    sanitizedRepo.language,
                    JSON.stringify(sanitizedRepo.topics),
                    sanitizedRepo.private,
                    sanitizedRepo.fork,
                    sanitizedRepo.id
                ]);
                syncedCount++;
            }
        }

        

        // Log sync activity (handle both authenticated and unauthenticated requests)
        const userId = req.user ? req.user.userId : null;
        if (userId) {
            await db.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                [userId, 'GITHUB_SYNC', 'repositories', req.ip, req.get('User-Agent')]
            );
        }
        
        logger.audit('GITHUB_SYNC', req, 'repositories', { 
            userId,
            syncedCount,
            totalRepos: sanitizedRepos.length,
            githubUsername: targetUsername,
            authenticated: !!req.user
        });

        // Clear GitHub cache after sync
        cache.clear('github');
        
        sendSuccess(res, {
            syncedCount,
            totalRepos: sanitizedRepos.length,
            githubUsername: targetUsername
        }, 'GitHub repositories synchronized successfully');

    } catch (error) {
        logger.error('GitHub sync failed', req, { 
            error: error.message,
            stack: error.stack,
            githubUsername: targetUsername,
            userId: req.user ? req.user.userId : null
        });
        
        // Handle specific GitHub API errors with standardized format
        if (error.response) {
            const status = error.response.status;
            
            if (status === 403) {
                // Rate limit exceeded or authentication required
                if (error.response.headers['x-ratelimit-remaining'] === '0') {
                    const resetTime = new Date(error.response.headers['x-ratelimit-reset'] * 1000);
                    return sendError(res, 'RATE_LIMIT', 'GitHub API rate limit exceeded. Please try again later.', {
                        resetTime: resetTime.toISOString(),
                        retryAfter: Math.ceil((resetTime - new Date()) / 1000)
                    });
                } else {
                    // Check if this is due to missing/invalid token
                    const hasToken = process.env.GITHUB_TOKEN && 
                                   process.env.GITHUB_TOKEN !== 'your-github-personal-access-token' && 
                                   process.env.GITHUB_TOKEN.trim() !== '';
                    
                    if (!hasToken) {
                        return sendError(res, 'CONFIG_ERROR', 'GitHub token not configured. Syncing public repositories without authentication.', {
                            requiresToken: false,
                            publicAccess: true
                        });
                    } else {
                        return sendError(res, 'FORBIDDEN', 'GitHub API authentication failed or insufficient permissions');
                    }
                }
            } else if (status === 401) {
                // Check if this is due to placeholder token
                if (process.env.GITHUB_TOKEN === 'your-github-personal-access-token') {
                    return sendError(res, 'CONFIG_ERROR', 'GitHub token is using placeholder value. Please configure a valid GitHub Personal Access Token or remove it to sync public repositories.', {
                        requiresToken: false,
                        publicAccess: true
                    });
                } else {
                    return sendError(res, 'UNAUTHORIZED', 'Invalid GitHub token or authentication failed');
                }
            } else if (status === 404) {
                return sendError(res, 'NOT_FOUND', `GitHub user '${targetUsername}' not found or has no public repositories`);
            } else {
                return sendError(res, 'EXTERNAL_API_ERROR', `GitHub API error: ${error.response.statusText}`, {
                    status: error.response.status,
                    githubError: error.response.data
                });
            }
        } else if (error.request) {
            // Network error
            return sendError(res, 'EXTERNAL_API_ERROR', 'Failed to connect to GitHub API. Please check your internet connection.');
        }
        
        sendError(res, 'EXTERNAL_API_ERROR', 'Failed to sync GitHub repositories');
    }
});

// Input validation for repository listing
const validateRepoQuery = [
    commonValidations.page,
    commonValidations.limit,
    commonValidations.language,
    commonValidations.sort
];

// Get cached repositories
router.get('/repos', validateRepoQuery, handleValidationErrors, 
    cache.middleware('github', (req) => {
        return cache.generateKey('github_repos', { 
            url: req.originalUrl, 
            query: req.query 
        });
    }), 
async (req, res) => {
    try {
        const db = req.db;
        const { page = 1, limit = 20, language, sort = 'stars' } = req.query;
        
        // Sanitize and validate input parameters using standardized sanitizers
        const pageNum = sanitizers.sanitizePage(page);
        const limitNum = sanitizers.sanitizeLimit(limit);
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE is_private = FALSE';
        let params = [];

        if (language && language.trim()) {
            whereClause += ' AND language = ?';
            params.push(language.trim());
        }

        // Validate sort parameter to prevent SQL injection
        const validSortOptions = ['stars', 'updated', 'name'];
        const sanitizedSort = validSortOptions.includes(sort) ? sort : 'stars';
        
        const sortClause = sanitizedSort === 'stars' ? 'ORDER BY stars DESC' : 
                          sanitizedSort === 'updated' ? 'ORDER BY updated_at DESC' : 
                          'ORDER BY name ASC';

        const [repos] = await db.execute(`
            SELECT * FROM github_repos 
            ${whereClause} 
            ${sortClause}
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);

        const [totalCount] = await db.execute(`
            SELECT COUNT(*) as total FROM github_repos ${whereClause}
        `, params);

        sendSuccess(res, {
            repositories: repos,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount[0].total,
                pages: Math.ceil(totalCount[0].total / limitNum)
            }
        }, 'Repositories fetched successfully');

    } catch (error) {
        logger.error('Failed to fetch repositories', req, { 
            error: error.message,
            stack: error.stack,
            query: req.query
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch repositories');
    }
});

// Input validation for repository ID parameter
const validateRepoId = [
    commonValidations.repoId
];

// Get repository details
router.get('/repos/:repoId', validateRepoId, handleValidationErrors, async (req, res) => {
    try {
        const { repoId } = req.params;
        const db = req.db;

        // Additional validation using standardized sanitizer
        if (!sanitizers.isValidRepoId(repoId)) {
            return sendError(res, 'VALIDATION_ERROR', 'Invalid repository ID format');
        }

        const [repos] = await db.execute(
            'SELECT * FROM github_repos WHERE repo_id = ? AND is_private = FALSE',
            [repoId.trim()]
        );

        if (repos.length === 0) {
            return sendError(res, 'NOT_FOUND', 'Repository not found or access denied');
        }

        sendSuccess(res, { repository: repos[0] }, 'Repository fetched successfully');

    } catch (error) {
        logger.error('Failed to fetch repository', req, { 
            error: error.message,
            stack: error.stack,
            repoId: req.params.repoId
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch repository');
    }
});

module.exports = router;