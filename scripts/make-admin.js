const path = require('path');
const { createPool } = require('../src/api/utils/json-adapter');
require('dotenv').config({ path: path.resolve(__dirname, '../config/.env') });

async function makeUserAdmin(username) {
    const pool = createPool({
        database: process.env.DB_PATH || 'portfolio.json'
    });

    try {
        const connection = await pool.getConnection();
        
        // Update user role to admin
        const [result] = await connection.execute(
            'UPDATE users SET role = ? WHERE username = ?',
            ['admin', username]
        );
        
        if (result.affectedRows === 0) {
            console.log(`User '${username}' not found`);
        } else {
            console.log(`User '${username}' updated to admin role`);
            
            // Verify the update
            const [users] = await connection.execute(
                'SELECT id, username, email, role FROM users WHERE username = ?',
                [username]
            );
            
            if (users.length > 0) {
                console.log('User details:', users[0]);
            }
        }
        
        connection.release();
    } catch (error) {
        console.error('Error updating user role:', error);
    } finally {
        await pool.end();
    }
}

// Get username from command line argument
const username = process.argv[2];
if (!username) {
    console.log('Usage: node make-admin.js <username>');
    process.exit(1);
}

makeUserAdmin(username);