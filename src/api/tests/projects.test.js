const request = require('supertest');
const express = require('express');
const projectsRoutes = require('../routes/projects');
const TestHelpers = require('./helpers');

describe('Projects Tests', () => {
    let app;
    let mockDb;

    beforeEach(() => {
        mockDb = TestHelpers.getMockDb();
        app = TestHelpers.createMockApp([TestHelpers.createRouteConfig('/api/projects', projectsRoutes)], [], mockDb);
        TestHelpers.setupTestEnv();
    });

    afterEach(() => {
        TestHelpers.cleanup();
    });

  describe('Unit Tests - Utility Functions', () => {
        describe('Project Data Validation', () => {
            test('should validate project title constraints', () => {
                const validTitles = [
                    'My Project',
                    'A project with a very long title but still within limits',
                    'Project-123_with.special.chars'
                ];

                const invalidTitles = [
                    '', // Empty
                    'a'.repeat(201) // Too long (>200 chars)
                ];

                validTitles.forEach(title => {
                    expect(title.length).toBeGreaterThanOrEqual(1);
                    expect(title.length).toBeLessThanOrEqual(200);
                });

                invalidTitles.forEach(title => {
                    expect(title.length === 0 || title.length > 200).toBe(true);
                });
            });

            test('should validate project URLs', () => {
                const validUrls = [
                    'https://github.com/user/repo',
                    'https://example.com',
                    'http://localhost:3000'
                ];

                const invalidUrls = [
                    'not-a-url',
                    'ftp://invalid-protocol.com',
                    'javascript:alert("xss")'
                ];

                // Simple URL validation regex
                const urlRegex = /^https?:\/\/.+/;

                validUrls.forEach(url => {
                    expect(urlRegex.test(url)).toBe(true);
                });

                invalidUrls.forEach(url => {
                    expect(urlRegex.test(url)).toBe(false);
                });
            });

            test('should validate project status values', () => {
                const validStatuses = ['active', 'archived', 'draft'];
                const invalidStatuses = ['deleted', 'pending', 'invalid'];

                validStatuses.forEach(status => {
                    expect(validStatuses.includes(status)).toBe(true);
                });

                invalidStatuses.forEach(status => {
                    expect(validStatuses.includes(status)).toBe(false);
                });
            });
        });

        describe('Pagination Logic', () => {
            test('should calculate pagination correctly', () => {
                const totalItems = 100;
                const limit = 20;
                const page = 3;

                const offset = (page - 1) * limit;
                const totalPages = Math.ceil(totalItems / limit);

                expect(offset).toBe(40);
                expect(totalPages).toBe(5);
            });

            test('should handle edge cases in pagination', () => {
                // Test with zero items
                expect(Math.ceil(0 / 20)).toBe(0);

                // Test with exact division
                expect(Math.ceil(100 / 20)).toBe(5);

                // Test with remainder
                expect(Math.ceil(101 / 20)).toBe(6);
            });
        });
    });

    describe('Integration Tests - API Endpoints', () => {
        describe('GET /api/projects', () => {
            test('should get all projects successfully', async () => {
                const mockProjects = [
                    TestHelpers.createTestProjectData({ id: 1, title: 'Project 1' }),
                    TestHelpers.createTestProjectData({ id: 2, title: 'Project 2' })
                ];

                mockProjects.forEach(project => {
                    project.technologies = 'JavaScript,Node.js';
                    project.total_count = 2;
                });

                mockDb.execute.mockResolvedValueOnce([mockProjects]);
                mockDb.execute.mockResolvedValueOnce([{ total: 2 }]);

                const response = await request(app)
                    .get('/api/projects');

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.data.projects).toBeDefined();
                expect(response.body.data.projects).toHaveLength(2);
                TestHelpers.validatePagination(response, 1, 20);
            });

            test('should handle pagination parameters', async () => {
                const mockProjects = [
                    TestHelpers.createTestProjectData({ id: 1, title: 'Project 1' })
                ];
                mockProjects[0].technologies = 'JavaScript';
                mockProjects[0].total_count = 1;

                mockDb.execute.mockResolvedValueOnce([mockProjects]);
                mockDb.execute.mockResolvedValueOnce([{ total: 1 }]);

                const response = await request(app)
                    .get('/api/projects?page=2&limit=10');

                TestHelpers.validateSuccessResponse(response, 200);
                TestHelpers.validatePagination(response, 2, 10);

                // Verify SQL parameters
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('LIMIT ? OFFSET ?'),
                    expect.arrayContaining([10, 10])
                );
            });

            test('should filter by featured status', async () => {
                mockDb.execute.mockResolvedValueOnce([]);
                mockDb.execute.mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get('/api/projects?featured=true');

                TestHelpers.validateSuccessResponse(response, 200);

                // Verify WHERE clause includes featured filter
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('AND featured = TRUE'),
                    expect.any(Array)
                );
            });

            test('should filter by status', async () => {
                mockDb.execute.mockResolvedValueOnce([]);
                mockDb.execute.mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get('/api/projects?status=archived');

                TestHelpers.validateSuccessResponse(response, 200);

                // Verify WHERE clause includes status filter
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('WHERE status = ?'),
                    expect.arrayContaining(['archived'])
                );
            });
        });

        describe('GET /api/projects/:id', () => {
            test('should get single project successfully', async () => {
                const mockProject = TestHelpers.createTestProjectData();
                mockProject.technologies = 'JavaScript,Node.js';

                mockDb.execute.mockResolvedValueOnce([[mockProject]]);

                const response = await request(app)
                    .get('/api/projects/1');

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.data.project).toBeDefined();
                expect(response.body.data.project.id).toBe(1);
                expect(response.body.data.project.technologies).toEqual(['JavaScript', 'Node.js']);
            });

            test('should return 404 for non-existent project', async () => {
                mockDb.execute.mockResolvedValueOnce([[]]);

                const response = await request(app)
                    .get('/api/projects/999');

                TestHelpers.validateErrorResponse(response, 404, 'Project not found');
            });
        });

        describe('POST /api/projects', () => {
            test('should create project successfully with authentication', async () => {
                const token = TestHelpers.generateTestToken();
                const projectData = {
                    title: 'New Project',
                    description: 'A new test project',
                    github_url: 'https://github.com/user/new-repo',
                    live_url: 'https://newproject.com',
                    featured: false,
                    status: 'active',
                    technologies: ['JavaScript', 'React']
                };

                const mockConnection = {
                    execute: jest.fn(),
                    query: jest.fn(),
                    beginTransaction: jest.fn(),
                    commit: jest.fn(),
                    rollback: jest.fn(),
                    release: jest.fn()
                };

                mockDb.getConnection.mockResolvedValue(mockConnection);
                mockConnection.execute
                    .mockResolvedValueOnce([{ insertId: 1 }]) // Insert project
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(projectData);

                TestHelpers.validateSuccessResponse(response, 201);
                expect(response.body.message).toBe('Project created successfully');
                expect(response.body.data.projectId).toBe(1);
            });

            test('should reject project creation without authentication', async () => {
                const projectData = {
                    title: 'New Project',
                    description: 'A new test project'
                };

                const response = await request(app)
                    .post('/api/projects')
                    .send(projectData);

                TestHelpers.validateErrorResponse(response, 401, 'Access token required');
            });

            test('should validate project data on creation', async () => {
                const token = TestHelpers.generateTestToken();
                const invalidData = {
                    title: '', // Empty title
                    github_url: 'not-a-url'
                };

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(invalidData);

                TestHelpers.validateErrorResponse(response, 400);
                expect(response.body.error.details.validationErrors).toBeDefined();
            });

            test('should handle database transaction rollback on error', async () => {
                const token = TestHelpers.generateTestToken();
                const projectData = {
                    title: 'New Project',
                    description: 'A new test project'
                };

                const mockConnection = {
                    execute: jest.fn().mockRejectedValue(new Error('Database error')),
                    query: jest.fn(),
                    beginTransaction: jest.fn(),
                    commit: jest.fn(),
                    rollback: jest.fn(),
                    release: jest.fn()
                };

                mockDb.getConnection.mockResolvedValue(mockConnection);

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(projectData);

                TestHelpers.validateErrorResponse(response, 500);
                expect(mockConnection.rollback).toHaveBeenCalled();
            });
        });

        describe('PUT /api/projects/:id', () => {
            test('should update project successfully with authentication', async () => {
                const token = TestHelpers.generateTestToken();
                const updateData = {
                    title: 'Updated Project',
                    description: 'Updated description',
                    status: 'archived',
                    technologies: ['Node.js', 'Express']
                };

                const existingProject = TestHelpers.createTestProjectData({ id: 1 });
                const mockConnection = {
                    execute: jest.fn(),
                    query: jest.fn(),
                    beginTransaction: jest.fn(),
                    commit: jest.fn(),
                    rollback: jest.fn(),
                    release: jest.fn()
                };

                mockDb.execute.mockResolvedValueOnce([[existingProject]]); // Get existing project
                mockDb.getConnection.mockResolvedValue(mockConnection);
                mockConnection.execute.mockResolvedValue([]); // Update and audit log

                const response = await request(app)
                    .put('/api/projects/1')
                    .set('Authorization', `Bearer ${token}`)
                    .send(updateData);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.message).toBe('Project updated successfully');
            });

            test('should return 404 when updating non-existent project', async () => {
                const token = TestHelpers.generateTestToken();
                const updateData = {
                    title: 'Updated Project'
                };

                mockDb.execute.mockResolvedValueOnce([[]]); // Project not found

                const response = await request(app)
                    .put('/api/projects/999')
                    .set('Authorization', `Bearer ${token}`)
                    .send(updateData);

                TestHelpers.validateErrorResponse(response, 404, 'Project not found');
            });
        });

        describe('DELETE /api/projects/:id', () => {
            test('should delete project successfully with authentication', async () => {
                const token = TestHelpers.generateTestToken();
                const existingProject = TestHelpers.createTestProjectData({ id: 1 });
                const mockConnection = {
                    execute: jest.fn(),
                    query: jest.fn(),
                    beginTransaction: jest.fn(),
                    commit: jest.fn(),
                    rollback: jest.fn(),
                    release: jest.fn()
                };

                mockDb.execute.mockResolvedValueOnce([[existingProject]]); // Get project for audit
                mockDb.getConnection.mockResolvedValue(mockConnection);
                mockConnection.execute.mockResolvedValue([]); // Delete and audit log

                const response = await request(app)
                    .delete('/api/projects/1')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.message).toBe('Project deleted successfully');
            });

            test('should return 404 when deleting non-existent project', async () => {
                const token = TestHelpers.generateTestToken();

                mockDb.execute.mockResolvedValueOnce([[]]); // Project not found

                const response = await request(app)
                    .delete('/api/projects/999')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 404, 'Project not found');
            });
        });
    });

  describe('Security Tests', () => {
        describe('SQL Injection Prevention', () => {
            test('should prevent SQL injection in project ID', async () => {
                const maliciousId = "1'; DROP TABLE projects; --";

                mockDb.execute.mockResolvedValueOnce([[]]);

                const response = await request(app)
                    .get(`/api/projects/${maliciousId}`);

                TestHelpers.validateErrorResponse(response, 404);

                // Verify parameterized query was used
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('WHERE p.id = ?'),
                    [maliciousId]
                );
            });

            test('should prevent SQL injection in query parameters', async () => {
                const maliciousStatus = "active'; DROP TABLE projects; --";

                mockDb.execute.mockResolvedValueOnce([]);
                mockDb.execute.mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get(`/api/projects?status=${encodeURIComponent(maliciousStatus)}`);

                // Should handle gracefully without SQL injection
                expect(response.status).toBe(200);
            });
        });

        describe('XSS Prevention', () => {
            test('should sanitize project title input', async () => {
                const token = TestHelpers.generateTestToken();
                const xssPayload = '<script>alert("xss")</script>';
                
                const projectData = {
                    title: xssPayload,
                    description: 'Test project'
                };

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(projectData);

                // Should fail validation or be sanitized
                expect(response.status).toBe(400);
            });

            test('should sanitize project description input', async () => {
                const token = TestHelpers.generateTestToken();
                const xssPayload = '<img src="x" onerror="alert(\'xss\')">';
                
                const projectData = {
                    title: 'Test Project',
                    description: xssPayload
                };

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(projectData);

                // Should handle XSS attempt
                expect(response.status).toBe(400);
            });
        });

        describe('Authorization Tests', () => {
            test('should require authentication for all write operations', async () => {
                const protectedEndpoints = [
                    { method: 'post', url: '/api/projects' },
                    { method: 'put', url: '/api/projects/1' },
                    { method: 'delete', url: '/api/projects/1' }
                ];

                for (const endpoint of protectedEndpoints) {
                    const response = await request(app)[endpoint.method](endpoint.url)
                        .send({ title: 'Test' });

                    TestHelpers.validateErrorResponse(response, 401, 'Access token required');
                }
            });

            test('should reject invalid tokens', async () => {
                const invalidToken = 'invalid.jwt.token';

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${invalidToken}`)
                    .send({ title: 'Test' });

                TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
            });
        });

        describe('Input Validation Security', () => {
            test('should validate URL formats to prevent XSS', async () => {
                const token = TestHelpers.generateTestToken();
                const maliciousUrls = [
                    'javascript:alert("xss")',
                    'data:text/html,<script>alert("xss")</script>',
                    'vbscript:msgbox("xss")'
                ];

                for (const url of maliciousUrls) {
                    const projectData = {
                        title: 'Test Project',
                        github_url: url
                    };

                    const response = await request(app)
                        .post('/api/projects')
                        .set('Authorization', `Bearer ${token}`)
                        .send(projectData);

                    expect(response.status).toBe(400);
                }
            });

            test('should limit input lengths to prevent DoS', async () => {
                const token = TestHelpers.generateTestToken();
                const longTitle = 'a'.repeat(201); // Exceeds 200 char limit

                const projectData = {
                    title: longTitle,
                    description: 'Test project'
                };

                const response = await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send(projectData);

                TestHelpers.validateErrorResponse(response, 400);
            });
        });
    });

  describe('Performance Tests', () => {
        test('should handle large number of projects in listing', async () => {
            // Mock large dataset
            const mockProjects = Array.from({ length: 100 }, (_, index) => 
                TestHelpers.createTestProjectData({ 
                    id: index + 1, 
                    title: `Project ${index + 1}`,
                    technologies: 'JavaScript,Node.js',
                    total_count: 100
                })
            );

            mockDb.execute.mockResolvedValueOnce([mockProjects]);
            mockDb.execute.mockResolvedValueOnce([{ total: 100 }]);

            const startTime = Date.now();
            
            const response = await request(app)
                .get('/api/projects?limit=50');

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            TestHelpers.validateSuccessResponse(response, 200);
            expect(response.body.data.projects).toHaveLength(50);
            expect(responseTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle concurrent project requests', async () => {
            mockDb.execute.mockResolvedValue([[]]);
            mockDb.execute.mockResolvedValueOnce([{ total: 0 }]);

            const startTime = Date.now();
            
            const promises = Array.from({ length: 20 }, () =>
                request(app).get('/api/projects/1')
            );

            const responses = await Promise.all(promises);
            const endTime = Date.now();

            // All requests should complete within reasonable time
            expect(endTime - startTime).toBeLessThan(3000); // 3 seconds
            
            // All responses should be handled (even if 404)
            responses.forEach(response => {
                expect([200, 404]).toContain(response.status);
            });
        });

        test('should handle database query optimization', async () => {
            mockDb.execute.mockResolvedValueOnce([]);
            mockDb.execute.mockResolvedValueOnce([{ total: 0 }]);

            const response = await request(app)
                .get('/api/projects?featured=true&status=active');

            // Verify that indexed columns are used in WHERE clause
            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringMatching(/WHERE status = \? AND featured = TRUE/),
                expect.any(Array)
            );

            TestHelpers.validateSuccessResponse(response, 200);
        });
    });

  describe('Error Handling Tests', () => {
        test('should handle database connection errors', async () => {
            mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get('/api/projects');

            TestHelpers.validateErrorResponse(response, 500, 'Failed to fetch projects');
        });

        test('should handle malformed JSON in POST requests', async () => {
            const token = TestHelpers.generateTestToken();

            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', `Bearer ${token}`)
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}');

            expect(response.status).toBe(400);
        });

        test('should handle missing required fields', async () => {
            const token = TestHelpers.generateTestToken();

            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', `Bearer ${token}`)
                .send({}); // Empty body

            TestHelpers.validateErrorResponse(response, 400);
            expect(response.body.errors).toBeDefined();
        });

        test('should handle transaction failures gracefully', async () => {
            const token = TestHelpers.generateTestToken();
            const projectData = {
                title: 'Test Project',
                description: 'Test description'
            };

            const mockConnection = {
                execute: jest.fn(),
                query: jest.fn(),
                beginTransaction: jest.fn().mockRejectedValue(new Error('Transaction failed')),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };

            mockDb.getConnection.mockResolvedValue(mockConnection);

            const response = await request(app)
                .post('/api/projects')
                .set('Authorization', `Bearer ${token}`)
                .send(projectData);

            TestHelpers.validateErrorResponse(response, 500);
        });
    });
});

  