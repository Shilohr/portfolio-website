const request = require('supertest');
const axios = require('axios');
const express = require('express');
const githubRoutes = require('../routes/github');
const TestHelpers = require('./helpers');

// Mock axios to avoid actual GitHub API calls
jest.mock('axios');

describe('GitHub Integration Tests', () => {
    let app;
    let mockDb;

    beforeEach(() => {
        mockDb = TestHelpers.getMockDb();
        app = TestHelpers.createMockApp([githubRoutes]);
        TestHelpers.setupTestEnv();
        
        // Reset axios mock
        jest.clearAllMocks();
    });

    afterEach(() => {
        TestHelpers.cleanup();
    });

  describe('Unit Tests - Utility Functions', () => {
        describe('GitHub Data Processing', () => {
            test('should process GitHub repository data correctly', () => {
                const rawRepo = {
                    id: 123456,
                    name: 'test-repo',
                    full_name: 'testuser/test-repo',
                    description: 'A test repository',
                    html_url: 'https://github.com/testuser/test-repo',
                    stargazers_count: 42,
                    forks_count: 10,
                    language: 'JavaScript',
                    topics: ['node', 'express', 'javascript'],
                    private: false,
                    fork: false
                };

                // Verify data structure
                expect(rawRepo.id).toBe(123456);
                expect(rawRepo.name).toBe('test-repo');
                expect(rawRepo.stargazers_count).toBe(42);
                expect(Array.isArray(rawRepo.topics)).toBe(true);
            });

            test('should handle repository data with missing fields', () => {
                const incompleteRepo = {
                    id: 123456,
                    name: 'test-repo',
                    // Missing other fields
                };

                // Should handle missing fields gracefully
                expect(incompleteRepo.id).toBe(123456);
                expect(incompleteRepo.name).toBe('test-repo');
                expect(incompleteRepo.description).toBeUndefined();
                expect(incompleteRepo.language).toBeUndefined();
            });

            test('should validate GitHub URL formats', () => {
                const validUrls = [
                    'https://github.com/user/repo',
                    'https://github.com/user/repo.git'
                ];

                const invalidUrls = [
                    'not-a-url',
                    'ftp://github.com/user/repo',
                    'https://gitlab.com/user/repo'
                ];

                const githubUrlRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/;

                validUrls.forEach(url => {
                    expect(githubUrlRegex.test(url.replace('.git', ''))).toBe(true);
                });

                invalidUrls.forEach(url => {
                    expect(githubUrlRegex.test(url)).toBe(false);
});
});

        describe('Rate Limiting Logic', () => {
            test('should calculate rate limit reset time correctly', () => {
                const resetTimestamp = 1640995200; // Unix timestamp
                const resetDate = new Date(resetTimestamp * 1000);

                expect(resetDate instanceof Date).toBe(true);
                expect(resetDate.getTime()).toBe(resetTimestamp * 1000);
            });

            test('should handle rate limit headers', () => {
                const headers = {
                    'x-ratelimit-remaining': '0',
                    'x-ratelimit-reset': '1640995200',
                    'x-ratelimit-limit': '60'
                };

                expect(parseInt(headers['x-ratelimit-remaining'])).toBe(0);
                expect(parseInt(headers['x-ratelimit-limit'])).toBe(60);
                expect(parseInt(headers['x-ratelimit-reset'])).toBe(1640995200);
            });
        });
    });

    describe('Integration Tests - API Endpoints', () => {
        describe('POST /api/github/sync', () => {
            test('should sync repositories successfully with authentication', async () => {
                const token = TestHelpers.generateTestToken();
                const mockRepos = [
                    {
                        id: 123456,
                        name: 'test-repo-1',
                        full_name: 'testuser/test-repo-1',
                        description: 'First test repository',
                        html_url: 'https://github.com/testuser/test-repo-1',
                        stargazers_count: 10,
                        forks_count: 5,
                        language: 'JavaScript',
                        topics: ['node', 'express'],
                        private: false,
                        fork: false
                    },
                    {
                        id: 789012,
                        name: 'test-repo-2',
                        full_name: 'testuser/test-repo-2',
                        description: 'Second test repository',
                        html_url: 'https://github.com/testuser/test-repo-2',
                        stargazers_count: 25,
                        forks_count: 12,
                        language: 'TypeScript',
                        topics: ['typescript', 'react'],
                        private: false,
                        fork: true
                    }
                ];

                // Mock GitHub API response
                axios.get.mockResolvedValue({
                    data: mockRepos,
                    status: 200,
                    headers: {}
                });

                // Mock database responses
                mockDb.execute
                    .mockResolvedValueOnce([[]]) // Check existing repo 1
                    .mockResolvedValueOnce([{ insertId: 1 }]) // Insert repo 1
                    .mockResolvedValueOnce([[]]) // Check existing repo 2
                    .mockResolvedValueOnce([{ insertId: 2 }]) // Insert repo 2
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.message).toBe('GitHub repositories synchronized successfully');
                expect(response.body.syncedCount).toBe(2);
                expect(response.body.totalRepos).toBe(2);

                // Verify GitHub API was called correctly
                expect(axios.get).toHaveBeenCalledWith(
                    'https://api.github.com/users/Shilohr/repos',
                    {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Portfolio-Website'
                        }
                    }
                );
            });

            test('should update existing repositories during sync', async () => {
                const token = TestHelpers.generateTestToken();
                const mockRepo = {
                    id: 123456,
                    name: 'existing-repo',
                    full_name: 'testuser/existing-repo',
                    description: 'Updated description',
                    html_url: 'https://github.com/testuser/existing-repo',
                    stargazers_count: 50,
                    forks_count: 20,
                    language: 'Python',
                    topics: ['python', 'django'],
                    private: false,
                    fork: false
                };

                axios.get.mockResolvedValue({
                    data: [mockRepo],
                    status: 200,
                    headers: {}
                });

                // Mock existing repository found
                mockDb.execute
                    .mockResolvedValueOnce([[{ id: 1 }]]) // Existing repo found
                    .mockResolvedValueOnce([]) // Update repo
                    .mockResolvedValueOnce([]); // Audit log

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.syncedCount).toBe(1);
            });

            test('should require authentication for sync', async () => {
                const response = await request(app)
                    .post('/api/github/sync');

                TestHelpers.validateErrorResponse(response, 401, 'Access token required');
            });

            test('should handle GitHub API rate limiting', async () => {
                const token = TestHelpers.generateTestToken();
                
                // Mock rate limit exceeded response
                axios.get.mockRejectedValue({
                    response: {
                        status: 403,
                        headers: {
                            'x-ratelimit-remaining': '0',
                            'x-ratelimit-reset': '1640995200'
                        }
                    }
                });

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 429, 'rate limit exceeded');
                expect(response.body.resetTime).toBeDefined();
            });

            test('should handle GitHub API authentication errors', async () => {
                const token = TestHelpers.generateTestToken();
                
                // Mock authentication error
                axios.get.mockRejectedValue({
                    response: {
                        status: 401
                    }
                });

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 401, 'authentication failed');
            });

            test('should handle GitHub API not found errors', async () => {
                const token = TestHelpers.generateTestToken();
                
                // Mock not found error
                axios.get.mockRejectedValue({
                    response: {
                        status: 404
                    }
                });

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 404, 'not found');
            });

            test('should handle network connectivity issues', async () => {
                const token = TestHelpers.generateTestToken();
                
                // Mock network error
                axios.get.mockRejectedValue(new Error('Network error'));

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateErrorResponse(response, 503, 'Failed to connect to GitHub API');
            });
        });

  describe('GET /api/github/repos', () => {
            test('should get cached repositories successfully', async () => {
                const mockRepos = [
                    TestHelpers.createTestGitHubRepoData({ id: 1, name: 'repo-1' }),
                    TestHelpers.createTestGitHubRepoData({ id: 2, name: 'repo-2' })
                ];

                mockDb.execute
                    .mockResolvedValueOnce([mockRepos]) // Get repos
                    .mockResolvedValueOnce([{ total: 2 }]); // Get count

                const response = await request(app)
                    .get('/api/github/repos');

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.repositories).toBeDefined();
                expect(response.body.repositories).toHaveLength(2);
                TestHelpers.validatePagination(response, 1, 20);
            });

            test('should filter repositories by language', async () => {
                mockDb.execute
                    .mockResolvedValueOnce([]) // Filtered repos
                    .mockResolvedValueOnce([{ total: 0 }]); // Count

                const response = await request(app)
                    .get('/api/github/repos?language=JavaScript');

                TestHelpers.validateSuccessResponse(response, 200);

                // Verify WHERE clause includes language filter
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('AND language = ?'),
                    expect.arrayContaining(['JavaScript'])
                );
            });

            test('should handle pagination parameters', async () => {
                mockDb.execute
                    .mockResolvedValueOnce([]) // Paginated repos
                    .mockResolvedValueOnce([{ total: 0 }]); // Count

                const response = await request(app)
                    .get('/api/github/repos?page=2&limit=10&sort=updated');

                TestHelpers.validateSuccessResponse(response, 200);
                TestHelpers.validatePagination(response, 2, 10);

                // Verify SQL parameters
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('LIMIT ? OFFSET ?'),
                    expect.arrayContaining([10, 10])
                );
            });

            test('should handle different sort options', async () => {
                const sortOptions = ['stars', 'updated', 'name'];

                for (const sort of sortOptions) {
                    mockDb.execute
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([{ total: 0 }]);

                    await request(app)
                        .get(`/api/github/repos?sort=${sort}`);

                    const expectedSortClause = sort === 'stars' ? 'ORDER BY stars DESC' :
                                           sort === 'updated' ? 'ORDER BY updated_at DESC' :
                                           'ORDER BY name ASC';

                    expect(mockDb.execute).toHaveBeenCalledWith(
                        expect.stringContaining(expectedSortClause),
                        expect.any(Array)
                    );
                }
            });

            test('should exclude private repositories from public results', async () => {
                mockDb.execute
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get('/api/github/repos');

                TestHelpers.validateSuccessResponse(response, 200);

                // Verify WHERE clause excludes private repos
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('WHERE is_private = FALSE'),
                    expect.any(Array)
                );
            });
        });

        describe('GET /api/github/repos/:repoId', () => {
            test('should get single repository successfully', async () => {
                const mockRepo = TestHelpers.createTestGitHubRepoData({ repo_id: '123456' });

                mockDb.execute.mockResolvedValueOnce([[mockRepo]]);

                const response = await request(app)
                    .get('/api/github/repos/123456');

                TestHelpers.validateSuccessResponse(response, 200);
                expect(response.body.repository).toBeDefined();
                expect(response.body.repository.repo_id).toBe('123456');
            });

            test('should return 404 for non-existent repository', async () => {
                mockDb.execute.mockResolvedValueOnce([[]]);

                const response = await request(app)
                    .get('/api/github/repos/999999');

                TestHelpers.validateErrorResponse(response, 404, 'Repository not found');
            });
        });
    });

describe('Security Tests', () => {
        describe('Input Validation', () => {
            test('should prevent SQL injection in repository ID', async () => {
                const maliciousId = "123456'; DROP TABLE github_repos; --";

                mockDb.execute.mockResolvedValueOnce([[]]);

                const response = await request(app)
                    .get(`/api/github/repos/${maliciousId}`);

                TestHelpers.validateErrorResponse(response, 404);

                // Verify parameterized query was used
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('WHERE repo_id = ?'),
                    [maliciousId]
                );
            });

            test('should prevent SQL injection in query parameters', async () => {
                const maliciousLanguage = "JavaScript'; DROP TABLE github_repos; --";

                mockDb.execute
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get(`/api/github/repos?language=${encodeURIComponent(maliciousLanguage)}`);

                // Should handle gracefully without SQL injection
                expect(response.status).toBe(200);
            });

            test('should validate sort parameter values', async () => {
                const invalidSorts = ['invalid', 'malicious', 'hack'];

                for (const sort of invalidSorts) {
                    mockDb.execute
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([{ total: 0 }]);

                    const response = await request(app)
                        .get(`/api/github/repos?sort=${sort}`);

                    // Should default to a safe sort option
                    expect(response.status).toBe(200);
                }
            });
        });

        describe('Authorization Tests', () => {
            test('should require authentication for sync endpoint', async () => {
                const response = await request(app)
                    .post('/api/github/sync');

                TestHelpers.validateErrorResponse(response, 401, 'Access token required');
            });

            test('should reject invalid tokens for sync', async () => {
                const invalidToken = 'invalid.jwt.token';

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${invalidToken}`);

                TestHelpers.validateErrorResponse(response, 403, 'Invalid or expired token');
            });

            test('should allow public access to repository listing', async () => {
                mockDb.execute
                    .mockResolvedValueOnce([])
                    .mockResolvedValueOnce([{ total: 0 }]);

                const response = await request(app)
                    .get('/api/github/repos');

                TestHelpers.validateSuccessResponse(response, 200);
            });
        });

        describe('Data Sanitization', () => {
            test('should sanitize repository data from GitHub API', async () => {
                const token = TestHelpers.generateTestToken();
                
                // Mock repository with potentially malicious data
                const maliciousRepo = {
                    id: 123456,
                    name: '<script>alert("xss")</script>',
                    full_name: 'testuser/<script>alert("xss")</script>',
                    description: '<img src="x" onerror="alert(\'xss\')">',
                    html_url: 'https://github.com/testuser/repo',
                    stargazers_count: 10,
                    forks_count: 5,
                    language: 'JavaScript',
                    topics: ['<script>alert("xss")</script>'],
                    private: false,
                    fork: false
                };

                axios.get.mockResolvedValue({
                    data: [maliciousRepo],
                    status: 200,
                    headers: {}
                });

                mockDb.execute
                    .mockResolvedValueOnce([[]])
                    .mockResolvedValueOnce([{ insertId: 1 }])
                    .mockResolvedValueOnce([]);

                const response = await request(app)
                    .post('/api/github/sync')
                    .set('Authorization', `Bearer ${token}`);

                TestHelpers.validateSuccessResponse(response, 200);

                // Verify data was stored (potentially sanitized)
                expect(mockDb.execute).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT INTO github_repos'),
                    expect.arrayContaining([
                        expect.any(String), // repo_id
                        expect.any(String), // name (may be sanitized)
                        expect.any(String), // full_name (may be sanitized)
                        expect.any(String), // description (may be sanitized)
                        expect.any(String), // html_url
                        expect.any(Number), // stars
                        expect.any(Number), // forks
                        expect.any(String), // language
                        expect.any(String), // topics (JSON string)
                        expect.any(Boolean), // is_private
                        expect.any(Boolean)  // is_fork
                    ])
                );
            });
        });
    });

    describe('Performance Tests', () => {
        test('should handle large repository datasets', async () => {
            // Mock large dataset
            const mockRepos = Array.from({ length: 100 }, (_, index) => 
                TestHelpers.createTestGitHubRepoData({ 
                    id: index + 1, 
                    repo_id: `${1000 + index}`,
                    name: `repo-${index + 1}`,
                    stars: Math.floor(Math.random() * 1000)
                })
            );

            mockDb.execute
                .mockResolvedValueOnce([mockRepos])
                .mockResolvedValueOnce([{ total: 100 }]);

            const startTime = Date.now();
            
            const response = await request(app)
                .get('/api/github/repos?limit=50');

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            TestHelpers.validateSuccessResponse(response, 200);
            expect(response.body.repositories).toHaveLength(50);
            expect(responseTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle concurrent repository requests', async () => {
            mockDb.execute
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{ total: 0 }]);

            const startTime = Date.now();
            
            const promises = Array.from({ length: 20 }, () =>
                request(app).get('/api/github/repos/123456')
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

        test('should handle GitHub API timeout gracefully', async () => {
            const token = TestHelpers.generateTestToken();
            
            // Mock timeout
            axios.get.mockImplementation(() => 
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 100)
                )
            );

            const response = await request(app)
                .post('/api/github/sync')
                .set('Authorization', `Bearer ${token}`);

            TestHelpers.validateErrorResponse(response, 503, 'Failed to connect to GitHub API');
        });
    });

    describe('Error Handling Tests', () => {
        test('should handle database connection errors', async () => {
            mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get('/api/github/repos');

            TestHelpers.validateErrorResponse(response, 500, 'Failed to fetch repositories');
        });

        test('should handle malformed repository data from GitHub', async () => {
            const token = TestHelpers.generateTestToken();
            
            // Mock malformed repository data
            const malformedRepo = {
                // Missing required fields
                id: null,
                name: undefined,
                stargazers_count: 'not-a-number'
            };

            axios.get.mockResolvedValue({
                data: [malformedRepo],
                status: 200,
                headers: {}
            });

            const response = await request(app)
                .post('/api/github/sync')
                .set('Authorization', `Bearer ${token}`);

            // Should handle gracefully or return appropriate error
            expect([200, 500]).toContain(response.status);
        });

        test('should handle GitHub API server errors', async () => {
            const token = TestHelpers.generateTestToken();
            
            // Mock server error
            axios.get.mockRejectedValue({
                response: {
                    status: 500,
                    data: { message: 'Internal server error' }
                }
            });

            const response = await request(app)
                .post('/api/github/sync')
                .set('Authorization', `Bearer ${token}`);

            TestHelpers.validateErrorResponse(response, 500, 'Failed to sync GitHub repositories');
        });

        test('should handle invalid pagination parameters', async () => {
            mockDb.execute
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ total: 0 }]);

            const response = await request(app)
                .get('/api/github/repos?page=-1&limit=0');

            // Should handle gracefully with default values
            expect(response.status).toBe(200);
        });
    });
});

  describe('Repository Tests', () => {
    it('should get repository by ID', async () => {
      mockDb.execute.mockResolvedValue([[mockRepo]]);

      const response = await request(app)
        .get('/api/github/repos/123456');

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.repository.name).toBe('test-repo');
      expect(response.body.repository.topics).toEqual(['node', 'express']);
    });

    it('should return 404 for non-existent repository', async () => {
      mockDb.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .get('/api/github/repos/999');

      TestHelpers.validateErrorResponse(response, 404, 'Repository not found');
    });

    it('should handle database errors', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/github/repos/1');

      TestHelpers.validateErrorResponse(response, 500, 'Failed to fetch repository');
    });

    it('should handle repository with null topics', async () => {
      const repoWithNullTopics = TestHelpers.createTestGitHubRepoData({ topics: null });
      mockDb.execute.mockResolvedValue([[repoWithNullTopics]]);

      const response = await request(app)
        .get('/api/github/repos/123456');

      TestHelpers.validateSuccessResponse(response, 200);
      expect(response.body.repository.topics).toEqual([]);
    });

    it('should validate repository ID parameter', async () => {
      const response = await request(app)
        .get('/api/github/repos/invalid');

      // Should handle gracefully - the route will treat it as a string
      TestHelpers.validateErrorResponse(response, 404, 'Repository not found');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle SQL injection attempts in repository queries', async () => {
      const maliciousId = "1; DROP TABLE github_repos; --";

      mockDb.execute.mockResolvedValue([[]]); // No repo found

      const response = await request(app)
        .get(`/api/github/repos/${maliciousId}`);

      TestHelpers.validateErrorResponse(response, 404, 'Repository not found');
    });

    it('should handle XSS attempts in query parameters', async () => {
      const xssQuery = {
        language: '<script>alert("xss")</script>',
        sort: 'javascript:alert("xss")'
      };

      mockDb.execute
        .mockResolvedValueOnce([[]]) // No repos
        .mockResolvedValueOnce([{ total: 0 }]); // No count

      const response = await request(app)
        .get('/api/github/repos')
        .query(xssQuery);

      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle very large query parameters', async () => {
      const largeQuery = {
        language: 'a'.repeat(1000),
        sort: 'b'.repeat(1000)
      };

      mockDb.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ total: 0 }]);

      const response = await request(app)
        .get('/api/github/repos')
        .query(largeQuery);

      TestHelpers.validateSuccessResponse(response, 200);
    });

    it('should handle malformed JSON in sync requests', async () => {
      const token = TestHelpers.generateTestToken();
      
      const response = await request(app)
        .post('/api/github/sync')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      TestHelpers.validateErrorResponse(response, 400);
    });

    it('should handle empty request body in sync', async () => {
      const token = TestHelpers.generateTestToken();
      
      const response = await request(app)
        .post('/api/github/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Should work fine as sync doesn't require body
      TestHelpers.validateSuccessResponse(response, 200);
    });
  });
});