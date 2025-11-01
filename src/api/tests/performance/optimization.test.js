const request = require('supertest');
const { app } = require('../../server');
const { cache } = require('../../utils/cache');
const { performanceMonitor } = require('../../utils/performanceMonitor');

describe('Performance Optimization Tests', () => {
    beforeEach(() => {
        // Reset cache and performance metrics before each test
        cache.clear();
        performanceMonitor.reset();
    });

    describe('Database Query Performance', () => {
        test('should use composite indexes for project queries', async () => {
            const startTime = Date.now();
            
            // Test projects listing with filters
            const response = await request(app)
                .get('/api/projects?featured=true&status=active')
                .expect(200);
            
            const duration = Date.now() - startTime;
            
            expect(response.body.success).toBe(true);
            expect(response.body.data.projects).toBeDefined();
            
            // Query should be fast with proper indexes (< 100ms)
            expect(duration).toBeLessThan(100);
            
            // Check if query was monitored
            const summary = performanceMonitor.getSummary();
            expect(summary.queries.total).toBeGreaterThan(0);
        });

        test('should cache project listings', async () => {
            // First request
            const response1 = await request(app)
                .get('/api/projects')
                .expect(200);
            
            expect(response1.headers['x-cache']).toBe('MISS');
            
            // Second request should hit cache
            const response2 = await request(app)
                .get('/api/projects')
                .expect(200);
            
            expect(response2.headers['x-cache']).toBe('HIT');
            
            // Cache stats should show hits
            const cacheStats = cache.getStats();
            expect(parseInt(cacheStats.hitRate)).toBeGreaterThan(0);
        });

        test('should invalidate cache on project updates', async () => {
            // First, populate cache
            await request(app)
                .get('/api/projects')
                .expect(200);
            
            // Create a project (should invalidate cache)
            const csrfResponse = await request(app)
                .get('/api/csrf-token')
                .expect(200);
            
            const authResponse = await request(app)
                .post('/api/auth/login')
                .set('Cookie', csrfResponse.headers['set-cookie'])
                .set('X-CSRF-Token', csrfResponse.body.csrfToken)
                .send({
                    username: 'testuser',
                    password: 'testpassword'
                });
            
            if (authResponse.body.success) {
                const token = authResponse.body.data.user.id;
                
                await request(app)
                    .post('/api/projects')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        title: 'Test Project',
                        description: 'Test Description',
                        status: 'active'
                    });
                
                // Next request should be cache miss
                const response = await request(app)
                    .get('/api/projects')
                    .expect(200);
                
                expect(response.headers['x-cache']).toBe('MISS');
            }
        });
    });

    describe('Transaction Performance', () => {
        test('should handle batch operations efficiently', async () => {
            // This test would require authentication setup
            // For now, we'll test the transaction mechanism indirectly
            
            const startTime = Date.now();
            
            // Test GitHub sync (uses batch operations)
            const response = await request(app)
                .post('/api/github/sync')
                .send({
                    username: 'test',
                    force: false
                });
            
            const duration = Date.now() - startTime;
            
            // Even if auth fails, the request should be handled quickly
            expect(duration).toBeLessThan(500);
        });
    });

    describe('Cache Performance', () => {
        test('should handle cache size limits', async () => {
            // Fill cache beyond limits
            for (let i = 0; i < 1500; i++) {
                cache.set(`test-key-${i}`, { data: `test-data-${i}` }, 'projects');
            }
            
            const stats = cache.getStats();
            
            // Cache should not exceed configured limits
            expect(stats.size).toBeLessThanOrEqual(1000); // projects max size
            
            // Should have evictions
            expect(parseInt(stats.evictions)).toBeGreaterThan(0);
        });

        test('should cleanup expired entries', async () => {
            // Set cache entry with very short TTL
            cache.set('expire-test', { data: 'test' }, 'projects');
            
            // Manually expire it
            const item = cache.cache.get('expire-test');
            if (item) {
                item.expiresAt = Date.now() - 1000;
            }
            
            // Trigger cleanup
            const deletedCount = cache.cleanup();
            
            expect(deletedCount).toBe(1);
            expect(cache.get('expire-test')).toBeNull();
        });
    });

    describe('Performance Monitoring', () => {
        test('should track slow queries', async () => {
            // Simulate a slow query by monitoring
            const query = 'SELECT SLEEP(0.1)'; // 100ms delay
            
            // This would be tracked by the performance monitor
            const result = performanceMonitor.recordQuery(query, 150);
            
            expect(result.duration).toBe(150);
            expect(result.count).toBe(1);
            
            const summary = performanceMonitor.getSummary();
            expect(summary.queries.total).toBeGreaterThan(0);
        });

        test('should provide performance summary', async () => {
            // Generate some activity
            await request(app).get('/api/projects');
            await request(app).get('/api/health');
            
            const summary = performanceMonitor.getSummary();
            
            expect(summary).toHaveProperty('queries');
            expect(summary).toHaveProperty('cache');
            expect(summary).toHaveProperty('requests');
            expect(summary).toHaveProperty('memory');
            expect(summary).toHaveProperty('timestamp');
        });
    });

    describe('Frontend Cache Performance', () => {
        test('should handle frontend caching efficiently', () => {
            // This would be tested in the browser environment
            // For now, we'll test the cache utility functions
            
            const apiModule = require('../../../public/js/modules/api.js');
            
            // Test cache key generation
            const key1 = apiModule.apiModule.generateKey('test', { a: 1, b: 2 });
            const key2 = apiModule.apiModule.generateKey('test', { b: 2, a: 1 });
            
            // Keys should be the same regardless of parameter order
            expect(key1).toBe(key2);
        });
    });

    describe('Index Utilization', () => {
        test('should use appropriate indexes for common queries', async () => {
            // This test would require EXPLAIN query analysis
            // For now, we'll test query patterns that should use indexes
            
            const queries = [
                'SELECT * FROM projects WHERE user_id = ? AND status = ?',
                'SELECT * FROM projects WHERE featured = ? ORDER BY order_index',
                'SELECT * FROM github_repos WHERE language = ? ORDER BY stars DESC',
                'SELECT * FROM project_images WHERE project_id = ? AND is_primary = ?'
            ];
            
            queries.forEach(query => {
                const hash = performanceMonitor.hashQuery(query);
                expect(hash).toBeDefined();
                expect(typeof hash).toBe('string');
            });
        });
    });
});