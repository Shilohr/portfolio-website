const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');

async function createAdminUser() {
    try {
        // Path to the JSON database
        const dbPath = path.join(__dirname, 'portfolio.json');
        
        // Read current database
        const data = JSON.parse(await fs.readFile(dbPath, 'utf8'));
        
        // Hash the password
        const passwordHash = await bcrypt.hash('admin123', 12);
        
        // Create admin user
        const adminUser = {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            password_hash: passwordHash,
            role: 'admin',
            is_active: true,
            login_attempts: 0,
            locked_until: null,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        // Add to database
        data.users.push(adminUser);
        
        // Save database
        await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
        
        console.log('✅ Admin user created successfully!');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Email: admin@example.com');
        console.log('Role: admin');
        
    } catch (error) {
        console.error('❌ Failed to create admin user:', error);
    }
}

createAdminUser();