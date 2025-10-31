const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Database Integration Tests', () => {
  let testDb;

  beforeAll(async () => {
    testDb = mysql.createPool({
      host: process.env.TEST_DB_HOST || 'localhost',
      user: process.env.TEST_DB_USER || 'portfolio',
      password: process.env.TEST_DB_PASSWORD || 'securepassword',
      database: process.env.TEST_DB_NAME || 'portfolio_test',
      charset: 'utf8mb4'
    });
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.end();
    }
  });

  beforeEach(async () => {
    // Clean up all tables
    const tables = [
      'audit_log',
      'user_sessions',
      'project_technologies',
      'project_images',
      'github_repos',
      'projects',
      'users'
    ];
    
    for (const table of tables) {
      await testDb.execute(`DELETE FROM ${table}`);
    }
  });

  describe('User Operations', () => {
    it('should create and retrieve users correctly', async () => {
      const userData = {
        username: 'dbtestuser',
        email: 'dbtest@example.com',
        password_hash: await bcrypt.hash('password123', 12),
        role: 'developer'
      };

      // Insert user
      const [result] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [userData.username, userData.email, userData.password_hash, userData.role]
      );

      expect(result.insertId).toBeDefined();

      // Retrieve user
      const [users] = await testDb.execute(
        'SELECT * FROM users WHERE id = ?',
        [result.insertId]
      );

      expect(users).toHaveLength(1);
      expect(users[0].username).toBe(userData.username);
      expect(users[0].email).toBe(userData.email);
      expect(users[0].role).toBe(userData.role);
      expect(users[0].is_active).toBe(true);
      expect(users[0].login_attempts).toBe(0);
      expect(users[0].locked_until).toBeNull();
    });

    it('should enforce unique constraints on username and email', async () => {
      const userData = {
        username: 'duplicateuser',
        email: 'duplicate@example.com',
        password_hash: 'hashedpassword'
      };

      // Insert first user
      await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [userData.username, userData.email, userData.password_hash]
      );

      // Try to insert duplicate username
      await expect(
        testDb.execute(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          [userData.username, 'different@example.com', userData.password_hash]
        )
      ).rejects.toThrow();

      // Try to insert duplicate email
      await expect(
        testDb.execute(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          ['differentuser', userData.email, userData.password_hash]
        )
      ).rejects.toThrow();
    });

    it('should handle user login attempts and account locking', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 12);
      
      // Insert user
      const [result] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['lockuser', 'lock@example.com', passwordHash]
      );

      const userId = result.insertId;

      // Simulate failed login attempts
      for (let i = 1; i <= 5; i++) {
        await testDb.execute(
          'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
          [
            i,
            i >= 5 ? Date.now() + 2 * 60 * 60 * 1000 : null, // Lock after 5 attempts
            userId
          ]
        );
      }

      // Verify account is locked
      const [users] = await testDb.execute(
        'SELECT login_attempts, locked_until FROM users WHERE id = ?',
        [userId]
      );

      expect(users[0].login_attempts).toBe(5);
      expect(users[0].locked_until).toBeGreaterThan(Date.now());
    });
  });

  describe('Project Operations', () => {
    it('should create projects with technologies correctly', async () => {
      // Insert project
      const [projectResult] = await testDb.execute(
        'INSERT INTO projects (title, description, status, featured) VALUES (?, ?, ?, ?)',
        ['DB Test Project', 'A database test project', 'active', true]
      );

      const projectId = projectResult.insertId;

      // Insert technologies
      const technologies = ['JavaScript', 'React', 'Node.js'];
      for (const tech of technologies) {
        await testDb.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [projectId, tech]
        );
      }

      // Verify project
      const [projects] = await testDb.execute(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );
      expect(projects).toHaveLength(1);
      expect(projects[0].title).toBe('DB Test Project');

      // Verify technologies
      const [techRecords] = await testDb.execute(
        'SELECT technology FROM project_technologies WHERE project_id = ? ORDER BY technology',
        [projectId]
      );
      expect(techRecords.map(t => t.technology)).toEqual(technologies);
    });

    it('should handle project ordering correctly', async () => {
      // Insert projects with different order indices
      const projects = [
        { title: 'Project 3', order_index: 3 },
        { title: 'Project 1', order_index: 1 },
        { title: 'Project 2', order_index: 2 }
      ];

      for (const project of projects) {
        await testDb.execute(
          'INSERT INTO projects (title, order_index) VALUES (?, ?)',
          [project.title, project.order_index]
        );
      }

      // Retrieve projects ordered by order_index
      const [orderedProjects] = await testDb.execute(
        'SELECT * FROM projects ORDER BY order_index ASC'
      );

      expect(orderedProjects).toHaveLength(3);
      expect(orderedProjects[0].title).toBe('Project 1');
      expect(orderedProjects[1].title).toBe('Project 2');
      expect(orderedProjects[2].title).toBe('Project 3');
    });

    it('should cascade delete project technologies when project is deleted', async () => {
      // Insert project
      const [projectResult] = await testDb.execute(
        'INSERT INTO projects (title) VALUES (?)',
        ['Cascade Test Project']
      );

      const projectId = projectResult.insertId;

      // Insert technologies
      await testDb.execute(
        'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
        [projectId, 'JavaScript']
      );

      // Verify technology exists
      const [techBefore] = await testDb.execute(
        'SELECT * FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(techBefore).toHaveLength(1);

      // Delete project
      await testDb.execute('DELETE FROM projects WHERE id = ?', [projectId]);

      // Verify technology was cascade deleted
      const [techAfter] = await testDb.execute(
        'SELECT * FROM project_technologies WHERE project_id = ?',
        [projectId]
      );
      expect(techAfter).toHaveLength(0);
    });
  });

  describe('Session Management', () => {
    it('should create and manage user sessions correctly', async () => {
      // Insert user
      const [userResult] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['sessionuser', 'session@example.com', 'hashedpassword']
      );

      const userId = userResult.insertId;

      // Create session
      const tokenHash = await bcrypt.hash('test-token', 12);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const [sessionResult] = await testDb.execute(
        'INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [userId, tokenHash, expiresAt, '127.0.0.1', 'Test Agent']
      );

      expect(sessionResult.insertId).toBeDefined();

      // Verify session
      const [sessions] = await testDb.execute(
        'SELECT * FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0].token_hash).toBe(tokenHash);

      // Deactivate session
      await testDb.execute(
        'UPDATE user_sessions SET is_active = FALSE WHERE id = ?',
        [sessions[0].id]
      );

      // Verify session is inactive
      const [inactiveSessions] = await testDb.execute(
        'SELECT * FROM user_sessions WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );
      expect(inactiveSessions).toHaveLength(0);
    });

    it('should handle expired sessions correctly', async () => {
      // Insert user
      const [userResult] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['expireuser', 'expire@example.com', 'hashedpassword']
      );

      const userId = userResult.insertId;

      // Create expired session
      const tokenHash = await bcrypt.hash('expired-token', 12);
      const expiresAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      await testDb.execute(
        'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, tokenHash, expiresAt]
      );

      // Query for active, non-expired sessions
      const [activeSessions] = await testDb.execute(
        'SELECT * FROM user_sessions WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW()',
        [userId]
      );
      expect(activeSessions).toHaveLength(0);
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log entries correctly', async () => {
      // Insert user
      const [userResult] = await testDb.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['audituser', 'audit@example.com', 'hashedpassword']
      );

      const userId = userResult.insertId;

      // Create audit log entries
      const auditActions = [
        { action: 'USER_LOGIN', resource_type: null, resource_id: null },
        { action: 'PROJECT_CREATED', resource_type: 'project', resource_id: 1 },
        { action: 'PROJECT_UPDATED', resource_type: 'project', resource_id: 1 },
        { action: 'USER_LOGOUT', resource_type: null, resource_id: null }
      ];

      for (const audit of auditActions) {
        await testDb.execute(
          'INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, audit.action, audit.resource_type, audit.resource_id, '127.0.0.1', 'Test Agent']
        );
      }

      // Verify audit log entries
      const [auditLogs] = await testDb.execute(
        'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at ASC',
        [userId]
      );

      expect(auditLogs).toHaveLength(4);
      expect(auditLogs[0].action).toBe('USER_LOGIN');
      expect(auditLogs[1].action).toBe('PROJECT_CREATED');
      expect(auditLogs[2].action).toBe('PROJECT_UPDATED');
      expect(auditLogs[3].action).toBe('USER_LOGOUT');
    });

    it('should store JSON data in audit log correctly', async () => {
      const oldValues = { title: 'Old Title', status: 'active' };
      const newValues = { title: 'New Title', status: 'archived' };

      await testDb.execute(
        'INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
        [1, 'PROJECT_UPDATED', 'project', 1, JSON.stringify(oldValues), JSON.stringify(newValues)]
      );

      const [auditLogs] = await testDb.execute(
        'SELECT old_values, new_values FROM audit_log WHERE action = ?',
        ['PROJECT_UPDATED']
      );

      expect(auditLogs).toHaveLength(1);
      expect(JSON.parse(auditLogs[0].old_values)).toEqual(oldValues);
      expect(JSON.parse(auditLogs[0].new_values)).toEqual(newValues);
    });
  });

  describe('Database Constraints and Indexes', () => {
    it('should enforce foreign key constraints', async () => {
      // Try to insert project technology for non-existent project
      await expect(
        testDb.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [999, 'JavaScript']
        )
      ).rejects.toThrow();

      // Try to insert user session for non-existent user
      await expect(
        testDb.execute(
          'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
          [999, 'hash', new Date()]
        )
      ).rejects.toThrow();
    });

    it('should enforce unique constraints on project technologies', async () => {
      // Insert project
      const [projectResult] = await testDb.execute(
        'INSERT INTO projects (title) VALUES (?)',
        ['Unique Test Project']
      );

      const projectId = projectResult.insertId;

      // Insert technology
      await testDb.execute(
        'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
        [projectId, 'JavaScript']
      );

      // Try to insert same technology again
      await expect(
        testDb.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [projectId, 'JavaScript']
        )
      ).rejects.toThrow();
    });

    it('should use indexes effectively for common queries', async () => {
      // Insert test data
      for (let i = 0; i < 100; i++) {
        await testDb.execute(
          'INSERT INTO projects (title, status, featured) VALUES (?, ?, ?)',
          [`Project ${i}`, i % 3 === 0 ? 'archived' : 'active', i % 10 === 0]
        );
      }

      // Query using indexed columns
      const start = Date.now();
      const [activeProjects] = await testDb.execute(
        'SELECT * FROM projects WHERE status = ? AND featured = ?',
        ['active', true]
      );
      const duration = Date.now() - start;

      expect(activeProjects.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast with indexes
    });
  });

  describe('Transaction Handling', () => {
    it('should handle transactions correctly', async () => {
      const connection = await testDb.getConnection();

      try {
        await connection.beginTransaction();

        // Insert project
        const [projectResult] = await connection.execute(
          'INSERT INTO projects (title) VALUES (?)',
          ['Transaction Test Project']
        );

        const projectId = projectResult.insertId;

        // Insert technology
        await connection.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [projectId, 'JavaScript']
        );

        // Commit transaction
        await connection.commit();

        // Verify both records exist
        const [projects] = await testDb.execute(
          'SELECT * FROM projects WHERE id = ?',
          [projectId]
        );
        expect(projects).toHaveLength(1);

        const [technologies] = await testDb.execute(
          'SELECT * FROM project_technologies WHERE project_id = ?',
          [projectId]
        );
        expect(technologies).toHaveLength(1);

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    });

    it('should rollback transactions on error', async () => {
      const connection = await testDb.getConnection();

      try {
        await connection.beginTransaction();

        // Insert project
        const [projectResult] = await connection.execute(
          'INSERT INTO projects (title) VALUES (?)',
          ['Rollback Test Project']
        );

        const projectId = projectResult.insertId;

        // Try to insert invalid data (should cause error)
        await connection.execute(
          'INSERT INTO project_technologies (project_id, technology) VALUES (?, ?)',
          [null, 'JavaScript'] // project_id cannot be null
        );

        await connection.commit();

      } catch (error) {
        await connection.rollback();

        // Verify project was not inserted
        const [projects] = await testDb.execute(
          'SELECT * FROM projects WHERE title = ?',
          ['Rollback Test Project']
        );
        expect(projects).toHaveLength(0);
      } finally {
        connection.release();
      }
    });
  });
});