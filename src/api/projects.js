const express = require('express');
const { authenticateToken } = require('./auth');
const { logger } = require('./utils/logger');
const { sendError, sendSuccess, createErrorResponse } = require('./utils/errorHandler');
const { commonValidations, handleValidationErrors, sanitizers, customValidations } = require('./utils/validation');
const { cache } = require('./utils/cache');
const { createTransactionManager } = require('./utils/transaction');
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
        const [projects] = await db.execute(`
            SELECT p.*, u.role as user_role 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ?
        `, [id]);
        
        if (projects.length === 0) {
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
        
        // Attach project to request for use in handlers
        req.project = project;
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
    handleValidationErrors
], cache.middleware('projects', (req) => {
    return cache.generateKey('projects', { 
        url: req.originalUrl, 
        query: req.query 
    });
}), async (req, res) => {
    try {
        const db = req.db;
        const { page = 1, limit = 20, featured, status = 'active', user_id } = req.query;
        
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

        const [projects] = await db.execute(`
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

        const totalCount = projects.length > 0 ? [{ total: projects[0].total_count }] : [{ total: 0 }];

        // Parse technologies and remove total_count from response
        const projectsWithTech = projects.map(project => {
            const { total_count, ...projectData } = project;
            // Sanitize technology strings by trimming and filtering empty values
            const technologies = project.technologies 
                ? project.technologies.split(',').map(tech => tech.trim()).filter(tech => tech.length > 0)
                : [];
            return {
                ...projectData,
                technologies
            };
        });

        sendSuccess(res, {
            projects: projectsWithTech,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount[0].total,
                pages: Math.ceil(totalCount[0].total / limitNum)
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

        const [projects] = await db.execute(`
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

        if (projects.length === 0) {
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
    try {

        const { title, description, github_url, live_url, featured = false, status = 'active', technologies = [] } = req.body;
        const db = req.db;
        
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
            if (technologies.length > 0) {
                const techOperations = technologies.map(tech => ({
                    name: `insert_tech_${tech}`,
                    query: 'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
                    params: [projectId, tech]
                }));
                
                await transactionManager.executeBatch(techOperations);
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
    try {

        const { id } = req.params;
        const { title, description, github_url, live_url, featured, status, technologies = [] } = req.body;
        const db = req.db;
        
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
            if (technologies.length > 0) {
                const techOperations = technologies.map(tech => ({
                    name: `insert_tech_${tech}`,
                    query: 'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
                    params: [id, tech]
                }));
                
                await transactionManager.executeBatch(techOperations);
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
    try {
        const { id } = req.params;
        const db = req.db;

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