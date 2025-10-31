#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('Generating secure production secrets...\n');

// Generate cryptographically secure secrets
const secrets = {
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    DB_PASSWORD: crypto.randomBytes(32).toString('hex'),
    DB_ROOT_PASSWORD: crypto.randomBytes(32).toString('hex')
};

console.log('Generated secrets:');
console.log(`JWT_SECRET: ${secrets.JWT_SECRET} (64 chars)`);
console.log(`DB_PASSWORD: ${secrets.DB_PASSWORD} (64 chars)`);
console.log(`DB_ROOT_PASSWORD: ${secrets.DB_ROOT_PASSWORD} (64 chars)\n`);

// Create .env.production file
const envContent = `# Database Configuration
DB_HOST=db
DB_USER=portfolio
DB_PASSWORD=${secrets.DB_PASSWORD}
DB_NAME=portfolio
DB_ROOT_PASSWORD=${secrets.DB_ROOT_PASSWORD}

# JWT Configuration
JWT_SECRET=${secrets.JWT_SECRET}

# Application Configuration
NODE_ENV=production
PORT=3000

# GitHub Configuration
GITHUB_USERNAME=shilohrobinson
GITHUB_TOKEN=your-github-personal-access-token

# Email Configuration (for password reset, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Security Configuration
# Production security settings enforced
# JWT_SECRET is 64 characters (cryptographically secure)
# Database passwords are 64 characters (cryptographically secure)
# CORS restricted to production domain
# HTTPS enforced
# Rate limiting enabled
`;

const envPath = path.join(__dirname, '../.env.production');

// Check if file already exists
if (fs.existsSync(envPath)) {
    console.log('Warning: .env.production already exists!');
    console.log('Backup created as .env.production.backup');
    fs.copyFileSync(envPath, envPath + '.backup');
}

// Write the new environment file
fs.writeFileSync(envPath, envContent);

console.log('.env.production created successfully!');
console.log('File location:', envPath);
console.log('\nSecurity reminders:');
console.log('   - Never commit .env.production to version control');
console.log('   - Store secrets securely (e.g., environment variables, secret manager)');
console.log('   - Update GITHUB_TOKEN and SMTP credentials with real values');
console.log('   - Ensure file permissions are set correctly (chmod 600 .env.production)');

// Set secure file permissions
try {
    fs.chmodSync(envPath, 0o600);
    console.log('File permissions set to 600 (read/write for owner only)');
} catch (error) {
    console.log('Warning: Could not set file permissions. Set manually: chmod 600 .env.production');
}

console.log('\nReady for production deployment!');