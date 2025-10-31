const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// Import the actual server
const express = require('express');
const projectsRoutes = require('../../projects');

describe('Projects Integration Tests', () => {
  let app;
  let testDb;
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Setup test database connection
    testDb = mysql.createPool({
      host: process.env.TEST_DB_HOST || 'localhost',
      user: process.env.TEST_DB_USER || 'portfolio',
      password: process.env.TEST_DB_PASSWORD || 'securepassword',
      database: process.env.TEST_DB_NAME || 'portfolio_test',
      charset: 'utf8mb4'
    });

    // Setup Express app with real projects routes
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.db = testDb;
      next();
    });
    app.use('/api/projects', projectsRoutes);

    // Create test user and get auth token
    const [userResult] = await testDb.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['testuser', 'test@example.com', 'hashedpassword', 'developer']
    );
    testUser = { id: userResult.insertId, username: 'testuser', role: 'developer' };
    authToken = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.end();
    }
  });

  beforeEach(async () => {
    // Clean up database before each test
    const tables = ['audit_log', 'project_technologies', 'project_images', 'projects'];
    for (const table of tables) {
      await testDb.execute(`DELETE FROM ${table}`);
    }
  });

  describe('Complete Project CRUD Flow', () => {
    it('should complete full create -> read -> update -> delete flow', async () => {
      const projectData = {
        title: 'Integration Test Project',
        description: 'A project for integration testing',
        github_url: 'https://github.com/test/integration-project',
        live_url: 'https://integration-test.example.com',
        featured: true,
        status: 'active',
        technologies: ['JavaScript', 'React', 'Node.js']
      };

      // Step 1: Create project
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(projectData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.message).toBe('Project created successfully');
      const projectId = createResponse.body.projectId;
      expect(projectId).toBeDefined();

      // Verify project was created in database
      const [projects] = await testDb.execute(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );
      expect(projects).toHaveLength(1);
      expect(projects[0].title).toBe(projectData.title);

      // Verify technologies were added
      const [technologies] = await testDb.execute(
        'SELECT technology FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(technologies).toHaveLength(3);
      expect(technologies.map(t => t.technology)).toEqual(expect.arrayContaining(projectData.technologies));

      // Step 2: Read all projects
      const listResponse = await request(app)
        .get('/api/projects');

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.projects).toHaveLength(1);
      expect(listResponse.body.projects[0].title).toBe(projectData.title);
      expect(listResponse.body.projects[0].technologies).toEqual(expect.arrayContaining(projectData.technologies));

      // Step 3: Read single project
      const singleResponse = await request(app)
        .get(`/api/projects/${projectId}`);

      expect(singleResponse.status).toBe(200);
      expect(singleResponse.body.project.title).toBe(projectData.title);

      // Step 4: Update project
      const updateData = {
        title: 'Updated Integration Project',
        description: 'Updated description',
        github_url: 'https://github.com/test/updated-project',
        live_url: 'https://updated.example.com',
        featured: false,
        status: 'archived',
        technologies: ['TypeScript', 'Vue.js', 'Express']
      };

      const updateResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.message).toBe('Project updated successfully');

      // Verify update in database
      const [updatedProjects] = await testDb.execute(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );
      expect(updatedProjects[0].title).toBe(updateData.title);
      expect(updatedProjects[0].status).toBe('archived');

      // Verify technologies were updated
      const [updatedTechnologies] = await testDb.execute(
        'SELECT technology FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(updatedTechnologies).toHaveLength(3);
      expect(updatedTechnologies.map(t => t.technology)).toEqual(expect.arrayContaining(updateData.technologies));

      // Step 5: Delete project
      const deleteResponse = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.message).toBe('Project deleted successfully');

      // Verify deletion
      const [deletedProjects] = await testDb.execute(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );
      expect(deletedProjects).toHaveLength(0);

      // Verify technologies were also deleted (cascade)
      const [deletedTechnologies] = await testDb.execute(
        'SELECT * FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(deletedTechnologies).toHaveLength(0);
    });
  });

  describe('Project Filtering and Pagination', () => {
    beforeEach(async () => {
      // Create test projects
      const projects = [
        { title: 'Active Project 1', status: 'active', featured: true, order_index: 1 },
        { title: 'Active Project 2', status: 'active', featured: false, order_index: 2 },
        { title: 'Archived Project', status: 'archived', featured: false, order_index: 3 },
        { title: 'Draft Project', status: 'draft', featured: false, order_index: 4 },
        { title: 'Active Project 3', status: 'active', featured: true, order_index: 5 }
      ];

      for (const project of projects) {
        const [result] = await testDb.execute(
          'INSERT INTO projects (title, status, featured, order_index) VALUES (?, ?, ?, ?)',
          [project.title, project.status, project.featured, project.order_index]
        );

        // Add some technologies
        if (project.title.includes('1')) {
          await testDb.execute(
            'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
            [result.insertId, 'JavaScript']
          );
        }
        if (project.title.includes('2')) {
          await testDb.execute(
            'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
            [result.insertId, 'Python']
          );
        }
      }
    });

    it('should filter projects by status', async () => {
      const response = await request(app)
        .get('/api/projects')
        .query({ status: 'active' });

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(3);
      response.body.projects.forEach(project => {
        expect(project.status).toBe('active');
      });
    });

    it('should filter projects by featured status', async () => {
      const response = await request(app)
        .get('/api/projects')
        .query({ featured: 'true' });

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      response.body.projects.forEach(project => {
        expect(project.featured).toBe(true);
      });
    });

    it('should paginate results correctly', async () => {
      const response = await request(app)
        .get('/api/projects')
        .query({ page: 1, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(3); // Only active projects by default
      expect(response.body.pagination.pages).toBe(2);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/projects')
        .query({ status: 'active', featured: 'true', page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].featured).toBe(true);
      expect(response.body.projects[0].status).toBe('active');
    });
  });

  describe('Database Integration', () => {
    it('should properly audit all project operations', async () => {
      const projectData = {
        title: 'Audit Test Project',
        description: 'Project for audit testing',
        technologies: ['JavaScript']
      };

      // Create project
      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(projectData);

      const projectId = createResponse.body.projectId;

      // Check creation audit
      const [createAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? AND resource_id = ?',
        ['PROJECT_CREATED', projectId]
      );
      expect(createAudit).toHaveLength(1);
      expect(createAudit[0].user_id).toBe(testUser.id);

      // Update project
      await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Project' });

      // Check update audit
      const [updateAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? AND resource_id = ?',
        ['PROJECT_UPDATED', projectId]
      );
      expect(updateAudit).toHaveLength(1);

      // Delete project
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Check deletion audit
      const [deleteAudit] = await testDb.execute(
        'SELECT * FROM audit_log WHERE action = ? AND resource_id = ?',
        ['PROJECT_DELETED', projectId]
      );
      expect(deleteAudit).toHaveLength(1);
    });

    it('should handle database transactions correctly', async () => {
      const projectData = {
        title: 'Transaction Test Project',
        technologies: ['JavaScript', 'React', 'Node.js']
      };

      // Create project with multiple technologies
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(projectData);

      expect(response.status).toBe(201);
      const projectId = response.body.projectId;

      // Verify all technologies were created
      const [technologies] = await testDb.execute(
        'SELECT * FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(technologies).toHaveLength(3);

      // Verify project was created
      const [projects] = await testDb.execute(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );
      expect(projects).toHaveLength(1);
    });

    it('should handle foreign key constraints correctly', async () => {
      // Try to add technology to non-existent project
      await expect(
        testDb.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [999, 'JavaScript']
        )
      ).rejects.toThrow();
    });
  });

  describe('Security Integration', () => {
    it('should require authentication for protected routes', async () => {
      const projectData = {
        title: 'Unauthorized Project',
        description: 'Should not be created'
      };

      // Try to create project without authentication
      const createResponse = await request(app)
        .post('/api/projects')
        .send(projectData);

      expect(createResponse.status).toBe(401);

      // Try to update project without authentication
      const updateResponse = await request(app)
        .put('/api/projects/1')
        .send({ title: 'Updated' });

      expect(updateResponse.status).toBe(401);

      // Try to delete project without authentication
      const deleteResponse = await request(app)
        .delete('/api/projects/1');

      expect(deleteResponse.status).toBe(401);
    });

    it('should validate input data properly', async () => {
      // Test with invalid data
      const invalidData = {
        title: '', // Empty title
        description: 'x'.repeat(1001), // Too long
        github_url: 'not-a-url',
        live_url: 'also-not-a-url',
        featured: 'not-a-boolean',
        status: 'invalid-status'
      };

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should prevent SQL injection', async () => {
      const maliciousData = {
        title: "Malicious Project'; DROP TABLE projects; --",
        description: 'Safe description'
      };

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maliciousData);

      // Should either succeed with sanitized data or fail validation
      expect([200, 201, 400]).toContain(response.status);

      // Verify projects table still exists
      const [projects] = await testDb.execute('SELECT COUNT(*) as count FROM projects');
      expect(projects[0].count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // Create app with broken database connection
      const brokenApp = express();
      brokenApp.use(express.json());
      brokenApp.use((req, res, next) => {
        req.db = {
          execute: jest.fn().mockRejectedValue(new Error('Connection failed')),
          getConnection: jest.fn().mockRejectedValue(new Error('Connection failed'))
        };
        next();
      });
      brokenApp.use('/api/projects', projectsRoutes);

      const response = await brokenApp
        .get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch projects');
    });

    it('should handle concurrent requests correctly', async () => {
      const projectData = {
        title: 'Concurrent Test Project',
        description: 'Test concurrent operations'
      };

      // Make multiple concurrent requests
      const promises = Array(5).fill().map(() =>
        request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${authToken}`)
          .send(projectData)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.projectId).toBeDefined();
      });

      // Verify all projects were created
      const [projects] = await testDb.execute(
        'SELECT * FROM projects WHERE title = ?',
        [projectData.title]
      );
      expect(projects).toHaveLength(5);
    });
  });
});