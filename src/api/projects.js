const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Input validation
const validateProject = [
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description max 1000 characters'),
    body('github_url').optional().isURL().withMessage('Valid GitHub URL required'),
    body('live_url').optional().isURL().withMessage('Valid live URL required'),
    body('featured').optional().isBoolean().withMessage('Featured must be boolean'),
    body('status').optional().isIn(['active', 'archived', 'draft']).withMessage('Invalid status')
];

// Get all projects (public)
router.get('/', async (req, res) => {
    try {
        const db = req.db;
        const { page = 1, limit = 20, featured, status = 'active' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        let whereClause = 'WHERE status = ?';
        let params = [status];

        if (featured === 'true') {
            whereClause += ' AND featured = TRUE';
        }

        const [projects] = await db.execute(`
            SELECT p.*, 
                   GROUP_CONCAT(DISTINCT pt.technology) as technologies
            FROM projects p
            LEFT JOIN project_technologies pt ON p.id = pt.project_id
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.order_index ASC, p.created_at DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `, params);

        const [totalCount] = await db.execute(`
            SELECT COUNT(*) as total FROM projects ${whereClause}
        `, params);

        // Parse technologies
        const projectsWithTech = projects.map(project => ({
            ...project,
            technologies: project.technologies ? project.technologies.split(',') : []
        }));

        res.json({
            projects: projectsWithTech,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount[0].total,
                pages: Math.ceil(totalCount[0].total / limitNum)
            }
        });

    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Get single project
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.db;

        const [projects] = await db.execute(`
            SELECT p.*, 
                   GROUP_CONCAT(DISTINCT pt.technology) as technologies
            FROM projects p
            LEFT JOIN project_technologies pt ON p.id = pt.project_id
            WHERE p.id = ? AND p.status = 'active'
            GROUP BY p.id
        `, [id]);

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = {
            ...projects[0],
            technologies: projects[0].technologies ? projects[0].technologies.split(',') : []
        };

        res.json({ project });

    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// Create project (protected)
router.post('/', authenticateToken, validateProject, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { title, description, github_url, live_url, featured = false, status = 'active', technologies = [] } = req.body;
        const db = req.db;

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Insert project
            const [result] = await connection.execute(`
                INSERT INTO projects (title, description, github_url, live_url, featured, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [title, description, github_url, live_url, featured, status]);

            const projectId = result.insertId;

            // Insert technologies
            if (technologies.length > 0) {
                const techValues = technologies.map(tech => [projectId, tech]);
                await connection.query(
                    'INSERT INTO project_technologies (project_id, technology) VALUES ?',
                    [techValues]
                );
            }

            // Log creation
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_CREATED', 'project', projectId, JSON.stringify(req.body), req.ip, req.get('User-Agent')]
            );

            await connection.commit();

            res.status(201).json({
                message: 'Project created successfully',
                projectId
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update project (protected)
router.put('/:id', authenticateToken, validateProject, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { title, description, github_url, live_url, featured, status, technologies = [] } = req.body;
        const db = req.db;

        // Get current project for audit
        const [currentProject] = await db.execute(
            'SELECT * FROM projects WHERE id = ?',
            [id]
        );

        if (currentProject.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Update project
            await connection.execute(`
                UPDATE projects 
                SET title = ?, description = ?, github_url = ?, live_url = ?, featured = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [title, description, github_url, live_url, featured, status, id]);

            // Update technologies
            await connection.execute('DELETE FROM project_technologies WHERE project_id = ?', [id]);
            if (technologies.length > 0) {
                const techValues = technologies.map(tech => [id, tech]);
                await connection.query(
                    'INSERT INTO project_technologies (project_id, technology) VALUES ?',
                    [techValues]
                );
            }

            // Log update
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_UPDATED', 'project', id, JSON.stringify(currentProject[0]), JSON.stringify(req.body), req.ip, req.get('User-Agent')]
            );

            await connection.commit();

            res.json({ message: 'Project updated successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Delete project (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.db;

        // Get project for audit
        const [project] = await db.execute(
            'SELECT * FROM projects WHERE id = ?',
            [id]
        );

        if (project.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Delete project (cascade will handle technologies and images)
            await connection.execute('DELETE FROM projects WHERE id = ?', [id]);

            // Log deletion
            await connection.execute(
                'INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, 'PROJECT_DELETED', 'project', id, JSON.stringify(project[0]), req.ip, req.get('User-Agent')]
            );

            await connection.commit();

            res.json({ message: 'Project deleted successfully' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

module.exports = router;