const { createPool } = require('./api/utils/json-adapter');

async function testQuery() {
    try {
        const pool = createPool({
            database: 'portfolio.json'
        });
        
        const connection = await pool.getConnection();
        
        console.log('Testing user query...');
        const [users] = await connection.execute(
            'SELECT id, username, email, password_hash, role, is_active, login_attempts, locked_until FROM users WHERE username = ? OR email = ?',
            ['admin', 'admin']
        );
        
        console.log('Query result:', users);
        console.log('Number of users found:', users.length);
        
        if (users.length > 0) {
            console.log('First user:', users[0]);
        }
        
    } catch (error) {
        console.error('Query failed:', error);
    }
}

testQuery();