const express = require('express');
const bcrypt = require('bcryptjs');
const { createPool } = require('./src/api/utils/json-adapter');

const app = express();
app.use(express.json());

const pool = createPool({
    database: 'portfolio.json'
});

app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('Login request received:', req.body);
        
        const { username, password } = req.body;
        const connection = await pool.getConnection();
        
        console.log('Database connection established');
        
        const [users] = await connection.execute(
            'SELECT id, username, email, password_hash, role, is_active, login_attempts, locked_until FROM users WHERE username = ? OR email = ?',
            [username, username]
        );
        
        console.log('Query executed, users found:', users.length);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        console.log('Password validation:', isValidPassword);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({ success: true, user: { id: user.id, username: user.username } });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.listen(8082, () => {
    console.log('Test server running on port 8082');
});