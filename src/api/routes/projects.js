const express = require('express');
const { authenticateToken } = require('./auth');
const { body, param, query } = require('express-validator');
const { logger } = require('../utils/logger');
const { sendError, sendSuccess, createErrorResponse } = require('../utils/errorHandler');
const { commonValidations, handleValidationErrors, sanitizers, customValidations } = require('../utils/validation');
const { cache } = require('../utils/cache');
const { createTransactionManager } = require('../utils/transaction');
const router = express.Router();

// Enhanced input validation with SQL injection prevention
const validateProject = [
    commonValidations.title,
    commonValidations.description,
    commonValidations.githubUrl,
    commonValidations.liveUrl,
    commonValidations.boolean('featured'),
    commonValidations.status,
    commonValidations.technologies,
    commonValidations.technology
];

/**
 * Project ownership authorization middleware
 * Validates that the authenticated user owns the project or has admin privileges
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void} Calls next() if authorized, sends error response if not
 */
const checkProjectOwnership = [customValidations.validateProjectId, async (req, res, next) => {
    try {
        const { id } = req.params;
        const db = req.db;
        
        // Check if user owns the project or is admin
        let projects;
        try {
            [projects] = await db.execute(`
                SELECT p.*, u.role as user_role 
                FROM projects p 
                JOIN users u ON p.user_id = u.id 
                WHERE p.id = ?
            `, [id]);
        } catch (error) {
            // Fallback for JSON adapter
            logger.warn('Using fallback query for ownership check (JSON adapter)', req, { error: error.message });
            
            try {
                [projects] = await db.execute(`
                    SELECT p.*, u.role as user_role 
                    FROM projects p 
                    LEFT JOIN users u ON p.user_id = u.id 
                    WHERE p.id = ?
                `, [id]);
            } catch (fallbackError) {
                logger.error('Ownership fallback query also failed', req, { error: fallbackError.message });
                projects = [];
            }
        }
        
        if (!Array.isArray(projects) || projects.length === 0) {
            return sendError(res, 'NOT_FOUND', 'Project not found');
        }
        
        const project = projects[0];
        const isOwner = project.user_id === req.user.userId;
        const isAdmin = req.user.role === 'admin';
        
        if (!isOwner && !isAdmin) {
            logger.warn('Unauthorized project access attempt', req, {
                projectId: id,
                userId: req.user.userId,
                userRole: req.user.role,
                projectOwnerId: project.user_id
            });
            return sendError(res, 'FORBIDDEN', 'Access denied: You do not own this project');
        }
        
        // Attach project array to request for use in handlers (maintaining consistency)
        req.project = projects;
        next();
        
    } catch (error) {
        logger.error('Ownership check failed', req, { 
            error: error.message,
            stack: error.stack,
            projectId: req.params.id
        });
        sendError(res, 'DATABASE_ERROR', 'Authorization check failed');
    }
}];

// Get all projects (public)
router.get('/', [
    commonValidations.page,
    commonValidations.limit,
    customValidations.validateFilterParams,
    query('search')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search term must be 1-100 characters')
        .escape(),
    handleValidationErrors
], cache.middleware('projects', (req) => {
    return cache.generateKey('projects', { 
        url: req.originalUrl, 
        query: req.query 
    });
}), async (req, res) => {
    try {
        const db = req.db;
        const { page = 1, limit = 20, featured, status = 'active', user_id, search } = req.query;
        
        // Enhanced input validation for pagination parameters
        if (page !== undefined && (isNaN(page) || page < 1 || page > 1000)) {
            return sendError(res, 'VALIDATION_ERROR', 'Page parameter must be a positive integer between 1 and 1000');
        }
        
        if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
            return sendError(res, 'VALIDATION_ERROR', 'Limit parameter must be a positive integer between 1 and 100');
        }
        
        // Sanitize input parameters using standardized sanitizers
        const pageNum = sanitizers.sanitizePage(page);
        const limitNum = sanitizers.sanitizeLimit(limit);
        const offset = (pageNum - 1) * limitNum;
        
        // Validate status parameter
        const validStatuses = ['active', 'archived', 'draft'];
        const finalStatus = validStatuses.includes(status) ? status : 'active';
        
        // Build parameterized query to prevent SQL injection
        let whereClause = 'WHERE p.status = ?';
        let params = [finalStatus];

        if (featured === 'true') {
            whereClause += ' AND p.featured = TRUE';
        }
        
        // Optional user filtering (for admin use)
        if (user_id && /^\d+$/.test(user_id)) {
            whereClause += ' AND p.user_id = ?';
            params.push(user_id);
        }
        
        // Search functionality - search in title and description
        if (search && search.trim()) {
            const sanitizedSearch = sanitizers.sanitizeString(search, 100);
            if (sanitizedSearch) {
                whereClause += ' AND (p.title LIKE ? OR p.description LIKE ?)';
                const searchPattern = `%${sanitizedSearch}%`;
                params.push(searchPattern, searchPattern);
            }
        }

        let projects, totalCount;
        
        try {
            // Try the full SQL query with JOINs and aggregates
            [projects] = await db.execute(`
                SELECT p.id, p.title, p.description, p.github_url, p.live_url, 
                       p.featured, p.order_index, p.status, p.created_at, p.updated_at, p.user_id,
                       u.username as owner_username,
                       GROUP_CONCAT(DISTINCT pt.technology ORDER BY pt.technology) as technologies,
                       COUNT(*) OVER() as total_count
                FROM projects p
                LEFT JOIN project_technologies pt ON p.id = pt.project_id
                LEFT JOIN users u ON p.user_id = u.id
                ${whereClause}
                GROUP BY p.id, u.username
                ORDER BY p.order_index ASC, p.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limitNum, offset]);

            totalCount = (Array.isArray(projects) && projects.length > 0 && projects[0].total_count !== undefined) ? [{ total: projects[0].total_count }] : [{ total: 0 }];
        } catch (error) {
            // Fallback for JSON adapter - simplified query without window functions/GROUP_CONCAT
            logger.warn('Using fallback query for JSON adapter compatibility', req, { error: error.message });
            
            // Get basic projects without complex SQL features
            try {
                [projects] = await db.execute(`
                    SELECT p.id, p.title, p.description, p.github_url, p.live_url, 
                           p.featured, p.order_index, p.status, p.created_at, p.updated_at, p.user_id,
                           u.username as owner_username
                    FROM projects p
                    LEFT JOIN users u ON p.user_id = u.id
                    ${whereClause}
                    ORDER BY p.order_index ASC, p.created_at DESC
                    LIMIT ? OFFSET ?
                `, [...params, limitNum, offset]);
            } catch (fallbackError) {
                logger.error('Fallback query also failed', req, { error: fallbackError.message });
                projects = [];
            }

            // Get total count separately
            try {
                [totalCount] = await db.execute(`
                    SELECT COUNT(*) as total
                    FROM projects p
                    ${whereClause}
                `, params);
            } catch (countError) {
                logger.error('Count query failed', req, { error: countError.message });
                totalCount = [{ total: 0 }];
            }

            // Get technologies for each project separately
            if (Array.isArray(projects)) {
                for (const project of projects) {
                    const [techRows] = await db.execute(`
                        SELECT technology
                        FROM project_technologies
                        WHERE project_id = ?
                        ORDER BY technology
                    `, [project.id]);
                    project.technologies = techRows.map(row => row.technology).join(',');
                }
            } else {
                // If projects is not an array, set it to empty array to prevent crashes
                projects = [];
            }
        }

        // Parse technologies and remove total_count from response
        const projectsWithTech = Array.isArray(projects) ? projects.map(project => {
            const { total_count, ...projectData } = project;
            // Sanitize technology strings by trimming and filtering empty values
            const technologies = project.technologies 
                ? project.technologies.split(',').map(tech => tech.trim()).filter(tech => tech.length > 0)
                : [];
            return {
                ...projectData,
                technologies
            };
        }) : [];

        // Ensure total_count is properly handled for both SQL and JSON adapter modes
        // The totalCount variable already contains the correct total count from above

        sendSuccess(res, {
            projects: projectsWithTech,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: (Array.isArray(totalCount) && totalCount.length > 0) ? totalCount[0].total : 0,
                pages: (Array.isArray(totalCount) && totalCount.length > 0) ? Math.ceil(totalCount[0].total / limitNum) : 0
            }
        }, 'Projects fetched successfully');

    } catch (error) {
        logger.error('Failed to fetch projects', req, { 
            error: error.message,
            stack: error.stack,
            query: req.query
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch projects');
    }
});

// Get single project
router.get('/:id', [
    commonValidations.id,
    handleValidationErrors
], async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.db;

        let projects;
        
        try {
            // Try the full SQL query with JOINs and aggregates
            [projects] = await db.execute(`
                SELECT p.id, p.title, p.description, p.github_url, p.live_url, 
                       p.featured, p.order_index, p.status, p.created_at, p.updated_at, p.user_id,
                       u.username as owner_username,
                       GROUP_CONCAT(DISTINCT pt.technology ORDER BY pt.technology) as technologies
                FROM projects p
                LEFT JOIN project_technologies pt ON p.id = pt.project_id
                LEFT JOIN users u ON p.user_id = u.id
                WHERE p.id = ? AND p.status = 'active'
                GROUP BY p.id, u.username
            `, [id]);
        } catch (error) {
            // Fallback for JSON adapter
            logger.warn('Using fallback query for single project (JSON adapter)', req, { error: error.message });
            
            try {
                [projects] = await db.execute(`
                    SELECT p.id, p.title, p.description, p.github_url, p.live_url, 
                           p.featured, p.order_index, p.status, p.created_at, p.updated_at, p.user_id,
                           u.username as owner_username,
                           GROUP_CONCAT(DISTINCT pt.technology ORDER BY pt.technology) as technologies
                    FROM projects p
                    LEFT JOIN project_technologies pt ON p.id = pt.project_id
                    LEFT JOIN users u ON p.user_id = u.id
                    WHERE p.id = ? AND p.status = 'active'
                    GROUP BY p.id, u.username
                `, [id]);
            } catch (fallbackError) {
                logger.error('Single project fallback query also failed', req, { error: fallbackError.message });
                projects = [];
            }
        }

        if (!Array.isArray(projects) || projects.length === 0) {
            return sendError(res, 'NOT_FOUND', 'Project not found');
        }

        // Sanitize technology strings by trimming and filtering empty values
        const technologies = projects[0].technologies 
            ? projects[0].technologies.split(',').map(tech => tech.trim()).filter(tech => tech.length > 0)
            : [];
        
        const project = {
            ...projects[0],
            technologies
        };

        sendSuccess(res, { project }, 'Project fetched successfully');

    } catch (error) {
        logger.error('Failed to fetch project', req, { 
            error: error.message,
            stack: error.stack,
            projectId: id
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to fetch project');
    }
});

// Create project (protected)
router.post('/', authenticateToken, validateProject, handleValidationErrors, async (req, res) => {
    // Extract variables outside try block for error logging access
    const { title, description, github_url, live_url, featured = false, status = 'active', technologies = [] } = req.body;
    const db = req.db;

    try {
        
        // Sanitize technologies array using standardized sanitizer
        const sanitizedTechnologies = sanitizers.sanitizeStringArray(technologies, 50);

        // Use transaction manager
        const transactionManager = createTransactionManager(db);
        
        const result = await transactionManager.execute(async (connection) => {
            // Insert project with user_id for ownership
            const [projectResult] = await connection.execute(`
                INSERT INTO projects (user_id, title, description, github_url, live_url, featured, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [req.user.userId, title, description, github_url, live_url, featured, status]);

            const projectId = projectResult.insertId;

            // Batch insert technologies
            if (sanitizedTechnologies.length > 0) {
                const techOperations = sanitizedTechnologies.map(tech => ({
                    name: `insert_tech_${tech}`,
                    query: 'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
                    params: [projectId, tech]
                }));
                
                await transactionManager.executeBatch(techOperations, {}, connection);
            }

            // Log creation
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_CREATED', 'project', projectId, JSON.stringify(req.body), req.ip, req.get('User-Agent')]
            );
            
            logger.audit('PROJECT_CREATED', req, 'project', { 
                projectId,
                title,
                featured,
                status
            });

            return { projectId, title, featured, status };
        });

        // Invalidate relevant cache
        cache.invalidatePattern('projects:.*');
        
        sendSuccess(res, result, 'Project created successfully', 201);

    } catch (error) {
        logger.error('Failed to create project', req, { 
            error: error.message,
            stack: error.stack,
            requestBody: { title, description, github_url, live_url, featured, status }
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to create project');
    }
});

// Update project (protected)
router.put('/:id', authenticateToken, validateProject, checkProjectOwnership, handleValidationErrors, async (req, res) => {
    // Extract variables outside try block for error logging access
    const { id } = req.params;
    const { title, description, github_url, live_url, featured, status, technologies = [] } = req.body;
    const db = req.db;

    try {
        
        // Sanitize technologies array using standardized sanitizer
        const sanitizedTechnologies = sanitizers.sanitizeStringArray(technologies, 50);

        // Get current project for audit (already fetched in checkProjectOwnership)
        const currentProject = req.project;

        // Use transaction manager
        const transactionManager = createTransactionManager(db);
        
        await transactionManager.execute(async (connection) => {
            // Update project
            await connection.execute(`
                UPDATE projects 
                SET title = ?, description = ?, github_url = ?, live_url = ?, featured = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [title, description, github_url, live_url, featured, status, id]);

            // Update technologies with batch operations
            await connection.execute('DELETE FROM project_technologies WHERE project_id = ?', [id]);
            if (sanitizedTechnologies.length > 0) {
                const techOperations = sanitizedTechnologies.map(tech => ({
                    name: `insert_tech_${tech}`,
                    query: 'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
                    params: [id, tech]
                }));
                
                await transactionManager.executeBatch(techOperations, {}, connection);
            }

            // Log update
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_UPDATED', 'project', id, JSON.stringify(currentProject[0]), JSON.stringify(req.body), req.ip, req.get('User-Agent')]
            );
            
            logger.audit('PROJECT_UPDATED', req, 'project', { 
                projectId: id,
                title,
                featured,
                status,
                previousData: currentProject[0]
            });
        });

        // Invalidate relevant cache
        cache.invalidatePattern('projects:.*');
        cache.delete(cache.generateKey('projects', { id }));

        sendSuccess(res, null, 'Project updated successfully');

    } catch (error) {
        logger.error('Failed to update project', req, { 
            error: error.message,
            stack: error.stack,
            projectId: id,
            requestBody: { title, description, github_url, live_url, featured, status }
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to update project');
    }
});

// Delete project (protected)
router.delete('/:id', authenticateToken, checkProjectOwnership, handleValidationErrors, async (req, res) => {
    // Extract variables outside try block for error logging access
    const { id } = req.params;
    const db = req.db;

    try {

        // Get project for audit (already fetched in checkProjectOwnership)
        const project = req.project;

        // Use transaction manager
        const transactionManager = createTransactionManager(db);
        
        await transactionManager.execute(async (connection) => {
            // Delete project (cascade will handle technologies and images)
            await connection.execute('DELETE FROM projects WHERE id = ?', [id]);

            // Log deletion
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_DELETED', 'project', id, JSON.stringify(project[0]), req.ip, req.get('User-Agent')]
            );
            
            logger.audit('PROJECT_DELETED', req, 'project', { 
                projectId: id,
                deletedProject: project[0]
            });
        });

        // Invalidate relevant cache
        cache.invalidatePattern('projects:.*');
        cache.delete(cache.generateKey('projects', { id }));

        sendSuccess(res, null, 'Project deleted successfully');

    } catch (error) {
        logger.error('Failed to delete project', req, { 
            error: error.message,
            stack: error.stack,
            projectId: id
        });
        sendError(res, 'DATABASE_ERROR', 'Failed to delete project');
    }
});

module.exports = router;