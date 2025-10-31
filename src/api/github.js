const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('./auth');
const router = express.Router();

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_USERNAME = 'shilohrobinson'; // Update with actual username

// Cache GitHub repositories
router.post('/sync', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        
        // Fetch repositories from GitHub
        const response = await axios.get(`${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/repos`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Portfolio-Website'
            }
        });

        const repos = response.data;
        let syncedCount = 0;

        for (const repo of repos) {
            // Check if repo already exists
            const [existing] = await db.execute(
                'SELECT id FROM github_repos WHERE repo_id = ?',
                [repo.id.toString()]
            );

            if (existing.length === 0) {
                // Insert new repository
                await db.execute(`
                    INSERT INTO github_repos 
                    (repo_id, name, full_name, description, html_url, stars, forks, language, topics, is_private, is_fork)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    repo.id.toString(),
                    repo.name,
                    repo.full_name,
                    repo.description,
                    repo.html_url,
                    repo.stargazers_count,
                    repo.forks_count,
                    repo.language,
                    JSON.stringify(repo.topics || []),
                    repo.private,
                    repo.fork
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
                    repo.name,
                    repo.full_name,
                    repo.description,
                    repo.html_url,
                    repo.stargazers_count,
                    repo.forks_count,
                    repo.language,
                    JSON.stringify(repo.topics || []),
                    repo.private,
                    repo.fork,
                    repo.id.toString()
                ]);
                syncedCount++;
            }
        }

        // Log sync activity
        await db.execute(
            'INSERT INTO audit_log (user_id, action, resource_type, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, 'GITHUB_SYNC', 'repositories', req.ip, req.get('User-Agent')]
        );

        res.json({
            message: 'GitHub repositories synchronized successfully',
            syncedCount,
            totalRepos: repos.length
        });

    } catch (error) {
        console.error('GitHub sync error:', error);
        res.status(500).json({ error: 'Failed to sync GitHub repositories' });
    }
});

// Get cached repositories
router.get('/repos', async (req, res) => {
    try {
        const db = req.db;
        const { page = 1, limit = 20, language, sort = 'stars' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE is_private = FALSE';
        let params = [];

        if (language) {
            whereClause += ' AND language = ?';
            params.push(language);
        }

        const sortClause = sort === 'stars' ? 'ORDER BY stars DESC' : 
                          sort === 'updated' ? 'ORDER BY updated_at DESC' : 
                          'ORDER BY name ASC';

        const [repos] = await db.execute(`
            SELECT * FROM github_repos 
            ${whereClause} 
            ${sortClause}
            LIMIT ${parseInt(limit)} OFFSET ${offset}
        `, params);

        const [totalCount] = await db.execute(`
            SELECT COUNT(*) as total FROM github_repos ${whereClause}
        `, params);

        res.json({
            repositories: repos,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount[0].total,
                pages: Math.ceil(totalCount[0].total / limit)
            }
        });

    } catch (error) {
        console.error('Get repos error:', error);
        res.status(500).json({ error: 'Failed to fetch repositories' });
    }
});

// Get repository details
router.get('/repos/:repoId', async (req, res) => {
    try {
        const { repoId } = req.params;
        const db = req.db;

        const [repos] = await db.execute(
            'SELECT * FROM github_repos WHERE repo_id = ?',
            [repoId]
        );

        if (repos.length === 0) {
            return res.status(404).json({ error: 'Repository not found' });
        }

        res.json({ repository: repos[0] });

    } catch (error) {
        console.error('Get repo error:', error);
        res.status(500).json({ error: 'Failed to fetch repository' });
    }
});

module.exports = router;