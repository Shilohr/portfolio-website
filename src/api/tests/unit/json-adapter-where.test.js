const { JSONAdapter } = require('../../utils/json-adapter');

describe('JSON Adapter WHERE Clause Parsing with Table Aliases', () => {
    let adapter;
    let mockData;

    beforeEach(() => {
        adapter = new JSONAdapter(':memory:');
        
        // Create comprehensive mock project data with relevant fields
        mockData = {
            projects: [
                {
                    id: 1,
                    title: 'Featured Active Project',
                    description: 'Test project 1',
                    status: 'active',
                    featured: true,
                    expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: 2,
                    title: 'Non-featured Active Project',
                    description: 'Test project 2',
                    status: 'active',
                    featured: false,
                    expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: 3,
                    title: 'Featured Inactive Project',
                    description: 'Test project 3',
                    status: 'inactive',
                    featured: true,
                    expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: 4,
                    title: 'Non-featured Inactive Project',
                    description: 'Test project 4',
                    status: 'inactive',
                    featured: false,
                    expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: 5,
                    title: 'Project Without Expiration',
                    description: 'Test project 5',
                    status: 'active',
                    featured: true,
                    expires_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ]
        };
        
        adapter.data = mockData;
        adapter.initialized = true;
    });

    describe('Table Alias Stripping', () => {
        it('should strip table alias from featured boolean condition', () => {
            const whereClause = 'p.featured = TRUE';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(3); // Projects 1, 3, and 5 are featured
            expect(result.map(p => p.id)).toEqual([1, 3, 5]);
        });

        it('should strip table alias from status parameter condition', () => {
            const whereClause = 'p.status = ?';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(3); // Projects 1, 2, and 5 are active
            expect(result.map(p => p.id)).toEqual([1, 2, 5]);
        });

        it('should strip table alias from expires_at > NOW() condition', () => {
            const whereClause = 'p.expires_at > NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2); // Projects 1 and 2 expire in the future
            expect(result.map(p => p.id)).toEqual([1, 2]);
        });

        it('should strip table alias from expires_at < NOW() condition', () => {
            const whereClause = 'p.expires_at < NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2); // Projects 3 and 4 expired in the past
            expect(result.map(p => p.id)).toEqual([3, 4]);
        });

        it('should handle mixed conditions with table aliases', () => {
            const whereClause = 'p.featured = TRUE AND p.status = ?';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(2); // Projects 1 and 5 are featured and active
            expect(result.map(p => p.id)).toEqual([1, 5]);
        });

        it('should handle complex mixed conditions with table aliases', () => {
            const whereClause = 'p.featured = TRUE AND p.status = ? AND p.expires_at > NOW()';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(1); // Only project 1 meets all conditions
            expect(result.map(p => p.id)).toEqual([1]);
        });
    });

    describe('Boolean Conditions', () => {
        it('should handle TRUE boolean value with table alias', () => {
            const whereClause = 'p.featured = TRUE';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(3);
            expect(result.every(p => p.featured === true)).toBe(true);
        });

        it('should handle FALSE boolean value with table alias', () => {
            const whereClause = 'p.featured = FALSE';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
            expect(result.every(p => p.featured === false)).toBe(true);
        });

        it('should handle boolean conditions without table alias', () => {
            const whereClause = 'featured = TRUE';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(3);
            expect(result.every(p => p.featured === true)).toBe(true);
        });

        it('should handle case-insensitive boolean values', () => {
            const whereClause = 'p.featured = true';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(3);
            expect(result.every(p => p.featured === true)).toBe(true);
        });
    });

    describe('Parameterized Conditions', () => {
        it('should handle status parameter with table alias', () => {
            const whereClause = 'p.status = ?';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(3);
            expect(result.every(p => p.status === 'active')).toBe(true);
        });

        it('should handle status parameter without table alias', () => {
            const whereClause = 'status = ?';
            const params = ['inactive'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(2);
            expect(result.every(p => p.status === 'inactive')).toBe(true);
        });

        it('should handle multiple parameterized conditions', () => {
            const whereClause = 'p.status = ? AND p.featured = ?';
            const params = ['active', true];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(2);
            expect(result.every(p => p.status === 'active' && p.featured === true)).toBe(true);
        });
    });

    describe('Date/Time Functions', () => {
        it('should handle expires_at > NOW() with table alias', () => {
            const whereClause = 'p.expires_at > NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
            expect(result.every(p => {
                if (!p.expires_at) return false;
                return new Date(p.expires_at).getTime() > Date.now();
            })).toBe(true);
        });

        it('should handle expires_at < NOW() with table alias', () => {
            const whereClause = 'p.expires_at < NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
            expect(result.every(p => {
                if (!p.expires_at) return true; // null expires_at considered expired
                return new Date(p.expires_at).getTime() < Date.now();
            })).toBe(true);
        });

        it('should handle expires_at > NOW() without table alias', () => {
            const whereClause = 'expires_at > NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
        });

        it('should handle expires_at < NOW() without table alias', () => {
            const whereClause = 'expires_at < NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
        });

        it('should handle case-insensitive NOW() function', () => {
            const whereClause = 'p.expires_at > now()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
        });
    });

    describe('Complex WHERE Clauses', () => {
        it('should handle OR conditions with table aliases', () => {
            const whereClause = 'p.featured = TRUE OR p.status = ?';
            const params = ['inactive'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(4); // Projects 1, 3, 4, 5 (featured OR inactive)
            expect(result.map(p => p.id).sort()).toEqual([1, 3, 4, 5]);
        });

        it('should handle mixed AND/OR conditions with table aliases', () => {
            const whereClause = 'p.featured = TRUE AND (p.status = ? OR p.expires_at < NOW())';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(3); // Projects 1, 3, and 5
            expect(result.map(p => p.id).sort()).toEqual([1, 3, 5]);
        });

        it('should handle complex nested conditions', () => {
            const whereClause = 'p.featured = TRUE AND p.status = ? AND (p.expires_at > NOW() OR p.expires_at IS NULL)';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(2); // Projects 1 and 5
            expect(result.map(p => p.id).sort()).toEqual([1, 5]);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty WHERE clause', () => {
            const whereClause = '';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(5); // All projects returned
        });

        it('should handle null/undefined parameters', () => {
            const whereClause = 'p.status = ?';
            const params = [null];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(0); // No projects have null status
        });

        it('should throw error for parameter count mismatch', () => {
            const whereClause = 'p.status = ? AND p.featured = ?';
            const params = ['active']; // Missing second parameter
            
            expect(() => {
                adapter.applyWhereClause(mockData.projects, whereClause, params);
            }).toThrow('Parameter count mismatch');
        });

        it('should throw error for unsupported SQL constructs', () => {
            const whereClause = 'p.status LIKE ?';
            const params = ['%active%'];
            
            expect(() => {
                adapter.applyWhereClause(mockData.projects, whereClause, params);
            }).toThrow('Unsupported SQL construct');
        });

        it('should throw error for unsupported WHERE clause conditions', () => {
            const whereClause = 'p.status IN (?)';
            const params = [['active', 'inactive']];
            
            expect(() => {
                adapter.applyWhereClause(mockData.projects, whereClause, params);
            }).toThrow('Unsupported SQL construct');
        });

        it('should handle non-existent fields gracefully', () => {
            const whereClause = 'p.nonexistent_field = TRUE';
            
            expect(() => {
                adapter.applyWhereClause(mockData.projects, whereClause, []);
            }).toThrow('Unsupported WHERE clause condition');
        });

        it('should handle malformed table aliases', () => {
            const whereClause = 'invalid_alias.featured = TRUE';
            
            expect(() => {
                adapter.applyWhereClause(mockData.projects, whereClause, []);
            }).toThrow('Unsupported WHERE clause condition');
        });
    });

    describe('Regression Tests for Specific Issues', () => {
        it('should correctly parse p.featured = TRUE (Issue #1)', () => {
            const whereClause = 'p.featured = TRUE';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(3);
            expect(result.map(p => p.id)).toEqual([1, 3, 5]);
            expect(result.every(p => p.featured === true)).toBe(true);
        });

        it('should correctly parse p.status = ? (Issue #2)', () => {
            const whereClause = 'p.status = ?';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(3);
            expect(result.map(p => p.id)).toEqual([1, 2, 5]);
            expect(result.every(p => p.status === 'active')).toBe(true);
        });

        it('should correctly parse expires_at > NOW() with table aliases (Issue #3)', () => {
            const whereClause = 'p.expires_at > NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
            expect(result.map(p => p.id)).toEqual([1, 2]);
            expect(result.every(p => {
                if (!p.expires_at) return false;
                return new Date(p.expires_at).getTime() > Date.now();
            })).toBe(true);
        });

        it('should correctly parse expires_at < NOW() with table aliases (Issue #4)', () => {
            const whereClause = 'p.expires_at < NOW()';
            const result = adapter.applyWhereClause(mockData.projects, whereClause, []);
            
            expect(result).toHaveLength(2);
            expect(result.map(p => p.id)).toEqual([3, 4]);
            expect(result.every(p => {
                if (!p.expires_at) return true;
                return new Date(p.expires_at).getTime() < Date.now();
            })).toBe(true);
        });

        it('should correctly parse mixed conditions with table aliases (Issue #5)', () => {
            const whereClause = 'p.featured = TRUE AND p.status = ? AND p.expires_at > NOW()';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);
            
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(1);
            expect(result[0].featured).toBe(true);
            expect(result[0].status).toBe('active');
            expect(new Date(result[0].expires_at).getTime() > Date.now()).toBe(true);
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle large datasets efficiently', () => {
            // Create a large dataset
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                id: i + 1,
                title: `Project ${i + 1}`,
                status: i % 2 === 0 ? 'active' : 'inactive',
                featured: i % 3 === 0,
                expires_at: i % 4 === 0 ? new Date(Date.now() + 86400000).toISOString() : null
            }));

            const whereClause = 'p.featured = TRUE AND p.status = ?';
            const params = ['active'];
            const result = adapter.applyWhereClause(largeDataset, whereClause, params);

            expect(result.length).toBeGreaterThan(0);
            expect(result.every(p => p.featured === true && p.status === 'active')).toBe(true);
        });

        it('should handle empty dataset', () => {
            const whereClause = 'p.featured = TRUE';
            const result = adapter.applyWhereClause([], whereClause, []);

            expect(result).toHaveLength(0);
        });

        it('should handle whitespace in WHERE clause', () => {
            const whereClause = '  p.featured   =   TRUE   AND   p.status   =   ?  ';
            const params = ['active'];
            const result = adapter.applyWhereClause(mockData.projects, whereClause, params);

            expect(result).toHaveLength(2);
            expect(result.map(p => p.id).sort()).toEqual([1, 5]);
        });
    });
});