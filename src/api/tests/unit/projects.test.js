const request = require('supertest');
const express = require('express');
const projectsRoutes = require('../../routes/projects');
const TestHelpers = require('../helpers');

// Mock dependencies
jest.mock('mysql2/promise');

describe('Projects Routes', () => {
  let app;
  let mockDb;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDb = TestHelpers.getMockDb();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    
    mockDb.getConnection.mockResolvedValue(mockConnection);
    
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.db = mockDb;
      // Mock authentication for unit tests
      if (req.method !== 'GET') {
        req.user = { userId: 1, username: 'testuser', role: 'developer' };
      }
      next();
    });
    app.use('/api/projects', projectsRoutes);
  });

  describe('GET /api/projects', () => {
    it('should return paginated projects successfully', async () => {
      const mockProjects = [
        {
          id: 1,
          title: 'Test Project 1',
          description: 'Description 1',
          status: 'active',
          featured: false,
          technologies: 'JavaScript,React'
        },
        {
          id: 2,
          title: 'Test Project 2',
          description: 'Description 2',
          status: 'active',
          featured: true,
          technologies: 'Python,Django'
        }
      ];

      const mockCount = [{ total: 2 }];

      mockDb.execute
        .mockResolvedValueOnce([mockProjects]) // Projects query
        .mockResolvedValueOnce([mockCount]); // Count query

      const response = await request(app)
        .get('/api/projects')
        .query({ page: 1, limit: 20 });

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.projects[0].technologies).toEqual(['JavaScript', 'React']);
      TestHelpers.validatePagination(response, 1, 20);
    });

    it('should filter projects by featured status', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[]]) // Projects query
        .mockResolvedValueOnce([{ total: 0 }]); // Count query

      const response = await request(app)
        .get('/api/projects')
        .query({ featured: 'true' });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND featured = TRUE'),
        expect.arrayContaining(['active', expect.any(Number), expect.any(Number)])
      );
    });

    it('should filter projects by status', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[]]) // Projects query
        .mockResolvedValueOnce([{ total: 0 }]); // Count query

      const response = await request(app)
        .get('/api/projects')
        .query({ status: 'archived' });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        expect.arrayContaining(['archived', expect.any(Number), expect.any(Number)])
      );
    });

    it('should handle pagination with different page sizes', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[]]) // Projects query
        .mockResolvedValueOnce([{ total: 0 }]); // Count query

      const response = await request(app)
        .get('/api/projects')
        .query({ page: 2, limit: 10 });

      TestHelpers.validatePagination(response, 2, 10);
    });

    it('should handle empty results', async () => {
      mockDb.execute
        .mockResolvedValueOnce([[]]) // No projects
        .mockResolvedValueOnce([{ total: 0 }]); // No count

      const response = await request(app)
        .get('/api/projects');

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.projects).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/projects');

      TestHelpers.validateErrorResponse(response, 500, 'Failed to fetch projects');
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/projects')
        .query({ page: -1, limit: 0 });

      // Should still work but with default values
      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle projects without technologies', async () => {
      const mockProjectsWithoutTech = [
        {
          id: 1,
          title: 'Test Project',
          description: 'Description',
          status: 'active',
          featured: false,
          technologies: null
        }
      ];

      mockDb.execute
        .mockResolvedValueOnce([mockProjectsWithoutTech])
        .mockResolvedValueOnce([{ total: 1 }]);

      const response = await request(app)
        .get('/api/projects');

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.projects[0].technologies).toEqual([]);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return a single project successfully', async () => {
      const mockProject = {
        id: 1,
        title: 'Test Project',
        description: 'Test Description',
        status: 'active',
        technologies: 'JavaScript,React'
      };

      mockDb.execute.mockResolvedValueOnce([[mockProject]]);

      const response = await request(app)
        .get('/api/projects/1');

      expect(response.status).toBe(200);
      expect(response.body.project.title).toBe('Test Project');
      expect(response.body.project.technologies).toEqual(['JavaScript', 'React']);
    });

    it('should return 404 if project not found', async () => {
      mockDb.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/api/projects/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/projects/1');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch project');
    });
  });

  describe('POST /api/projects', () => {
    const validProjectData = TestHelpers.createTestProjectData();

    // Mock authentication middleware
    const mockAuth = TestHelpers.mockAuth();

    beforeEach(() => {
      // Add auth middleware to the route
      app.post('/api/projects', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.post && layer.route.path === '/'
      ).handle);
    });

    it('should create a project successfully', async () => {
      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([{ insertId: 1 }]) // Insert project
        .mockResolvedValueOnce([]); // Audit log
      mockConnection.query.mockResolvedValue([]); // Insert technologies

      const response = await request(app)
        .post('/api/projects')
        .send(validProjectData);

      TestHelpers.validateSuccessResponse(response, 201);
      expect(response.body.message).toBe('Project created successfully');
      expect(response.body.projectId).toBe(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should create project without optional fields', async () => {
      const minimalData = {
        title: 'Minimal Project'
      };

      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([]);
      mockConnection.query.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/projects')
        .send(minimalData);

      TestHelpers.validateSuccessResponse(response, 201);
    });

    it('should return 400 for invalid input', async () => {
      const invalidData = {
        title: '', // Empty title
        github_url: 'invalid-url'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidData);

      TestHelpers.validateErrorResponse(response, 400);
      expect(response.body.errors).toBeDefined();
    });

    it('should validate URL formats', async () => {
      const invalidUrlData = {
        title: 'Test Project',
        github_url: 'not-a-url',
        live_url: 'also-not-a-url'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidUrlData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should validate status values', async () => {
      const invalidStatusData = {
        title: 'Test Project',
        status: 'invalid-status'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidStatusData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should validate boolean fields', async () => {
      const invalidBooleanData = {
        title: 'Test Project',
        featured: 'not-a-boolean'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidBooleanData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle transaction rollback on error', async () => {
      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/projects')
        .send(validProjectData);

      TestHelpers.validateErrorResponse(response, 500, 'Failed to create project');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should handle database connection errors', async () => {
      mockDb.getConnection.mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .post('/api/projects')
        .send(validProjectData);

      TestHelpers.validateErrorResponse(response, 500, 'Failed to create project');
    });

    it('should require authentication', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use((req, res, next) => {
        req.db = mockDb;
        next();
      });
      appWithoutAuth.use('/api/projects', projectsRoutes);

      const response = await request(appWithoutAuth)
        .post('/api/projects')
        .send(validProjectData);

      TestHelpers.validateErrorResponse(response, 401, 'Access token required');
    });

    it('should handle very long descriptions', async () => {
      const longDescription = 'a'.repeat(1001); // Over limit
      const longData = {
        title: 'Test Project',
        description: longDescription
      };

      const response = await request(app)
        .post('/api/projects')
        .send(longData);

      TestHelpers.validateErrorResponse(response, 400);
    });
  });

  describe('PUT /api/projects/:id', () => {
    const updateData = {
      title: 'Updated Project',
      description: 'Updated Description',
      status: 'active',
      technologies: ['JavaScript', 'Node.js']
    };

    const mockAuth = TestHelpers.mockAuth();

    beforeEach(() => {
      app.put('/api/projects/:id', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.put && layer.route.path === '/:id'
      ).handle);
    });

    it('should update a project successfully', async () => {
      const existingProject = TestHelpers.createTestProjectData({
        id: 1,
        title: 'Old Project',
        description: 'Old Description',
        status: 'active'
      });

      mockDb.execute
        .mockResolvedValueOnce([[existingProject]]) // Get existing project
        .mockResolvedValueOnce([]); // Audit log

      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute
        .mockResolvedValueOnce([]); // Update project
      mockConnection.query.mockResolvedValue([]); // Update technologies

      const response = await request(app)
        .put('/api/projects/1')
        .send(updateData);

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.message).toBe('Project updated successfully');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should return 404 if project not found', async () => {
      mockDb.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .put('/api/projects/999')
        .send(updateData);

      TestHelpers.validateErrorResponse(response, 404, 'Project not found');
    });

    it('should return 400 for invalid input', async () => {
      const invalidData = {
        title: '',
        github_url: 'invalid-url'
      };

      const response = await request(app)
        .put('/api/projects/1')
        .send(invalidData);

      TestHelpers.validateErrorResponse(response, 400);
      expect(response.body.errors).toBeDefined();
    });

    it('should handle partial updates', async () => {
      const existingProject = TestHelpers.createTestProjectData({ id: 1 });
      const partialUpdate = {
        title: 'New Title Only'
      };

      mockDb.execute
        .mockResolvedValueOnce([[existingProject]])
        .mockResolvedValueOnce([]);

      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockResolvedValue([]);
      mockConnection.query.mockResolvedValue([]);

      const response = await request(app)
        .put('/api/projects/1')
        .send(partialUpdate);

      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle empty technologies array', async () => {
      const existingProject = TestHelpers.createTestProjectData({ id: 1 });
      const updateWithEmptyTech = {
        title: 'Updated Project',
        technologies: []
      };

      mockDb.execute
        .mockResolvedValueOnce([[existingProject]])
        .mockResolvedValueOnce([]);

      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockResolvedValue([]);
      mockConnection.query.mockResolvedValue([]);

      const response = await request(app)
        .put('/api/projects/1')
        .send(updateWithEmptyTech);

      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle transaction rollback on error', async () => {
      const existingProject = TestHelpers.createTestProjectData({ id: 1 });

      mockDb.execute.mockResolvedValueOnce([[existingProject]]);
      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/api/projects/1')
        .send(updateData);

      TestHelpers.validateErrorResponse(response, 500, 'Failed to update project');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should validate project ID parameter', async () => {
      const response = await request(app)
        .put('/api/projects/invalid-id')
        .send(updateData);

      // Should handle gracefully - the route will treat it as a string
      TestHelpers.validateErrorResponse(response, 400);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    const mockAuth = TestHelpers.mockAuth();

    beforeEach(() => {
      app.delete('/api/projects/:id', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.delete && layer.route.path === '/:id'
      ).handle);
    });

    it('should delete a project successfully', async () => {
      const existingProject = TestHelpers.createTestProjectData({
        id: 1,
        title: 'Project to Delete',
        description: 'Description'
      });

      mockDb.execute
        .mockResolvedValueOnce([[existingProject]]) // Get project for audit
        .mockResolvedValueOnce([]); // Audit log

      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockResolvedValue([]); // Delete project

      const response = await request(app)
        .delete('/api/projects/1');

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.message).toBe('Project deleted successfully');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should return 404 if project not found', async () => {
      mockDb.execute.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .delete('/api/projects/999');

      TestHelpers.validateErrorResponse(response, 404, 'Project not found');
    });

    it('should handle transaction rollback on error', async () => {
      mockDb.execute.mockResolvedValueOnce([[{ id: 1 }]]); // Project exists
      mockDb.getConnection.mockResolvedValue(mockConnection);
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/projects/1');

      TestHelpers.validateErrorResponse(response, 500, 'Failed to delete project');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use((req, res, next) => {
        req.db = mockDb;
        next();
      });
      appWithoutAuth.use('/api/projects', projectsRoutes);

      const response = await request(appWithoutAuth)
        .delete('/api/projects/1');

      TestHelpers.validateErrorResponse(response, 401, 'Access token required');
    });

    it('should handle database connection errors', async () => {
      mockDb.execute.mockResolvedValueOnce([[{ id: 1 }]]); // Project exists
      mockDb.getConnection.mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .delete('/api/projects/1');

      TestHelpers.validateErrorResponse(response, 500, 'Failed to delete project');
    });

    it('should validate project ID parameter', async () => {
      const response = await request(app)
        .delete('/api/projects/invalid-id');

      TestHelpers.validateErrorResponse(response, 400);
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle SQL injection attempts in project queries', async () => {
      const maliciousId = "1; DROP TABLE projects; --";

      mockDb.execute.mockResolvedValue([[]]); // No project found

      const response = await request(app)
        .get(`/api/projects/${maliciousId}`);

      TestHelpers.validateErrorResponse(response, 404, 'Project not found');
    });

    it('should handle XSS attempts in project data', async () => {
      const xssData = {
        title: '<script>alert("xss")</script>',
        description: 'Test description'
      };

      const mockAuth = TestHelpers.mockAuth();
      app.post('/api/projects/xss', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.post && layer.route.path === '/'
      ).handle);

      const response = await request(app)
        .post('/api/projects/xss')
        .send(xssData);

      // Should pass validation but be sanitized
      TestHelpers.validateSuccessResponse(response, 201);
    });

    it('should handle very large payloads', async () => {
      const largeData = {
        title: 'a'.repeat(1000), // Over limit
        description: 'b'.repeat(2000) // Over limit
      };

      const mockAuth = TestHelpers.mockAuth();
      app.post('/api/projects/large', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.post && layer.route.path === '/'
      ).handle);

      const response = await request(app)
        .post('/api/projects/large')
        .send(largeData);

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle null and undefined values', async () => {
      const nullData = {
        title: null,
        description: undefined,
        github_url: ''
      };

      const mockAuth = TestHelpers.mockAuth();
      app.post('/api/projects/null', mockAuth, projectsRoutes.stack.find(layer => 
        layer.route && layer.route.methods.post && layer.route.path === '/'
      ).handle);

      const response = await request(app)
        .post('/api/projects/null')
        .send(nullData);

      TestHelpers.validateErrorResponse(response, 400);
    });
  });
});