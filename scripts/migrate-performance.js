#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    let connection;
    
    try {
        console.log('🚀 Starting performance optimization migration...');
        
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: 'utf8mb4'
        });
        
        console.log('✅ Database connected successfully');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../database/migrations/add_performance_indexes.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📝 Migration file loaded');
        
        // Split SQL into individual statements
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        console.log(`🔧 Executing ${statements.length} SQL statements...`);
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            try {
                await connection.execute(statement);
                console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
            } catch (error) {
                // Ignore "duplicate key" errors since we used IF NOT EXISTS
                if (error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_KEY_COLUMN_DOES_NOT_EXITS') {
                    console.log(`⚠️  Statement ${i + 1}/${statements.length} skipped (index already exists)`);
                } else {
                    console.error(`❌ Statement ${i + 1}/${statements.length} failed:`, error.message);
                    throw error;
                }
            }
        }
        
        console.log('🎉 Performance optimization migration completed successfully!');
        
        // Show index information
        const [tables] = await connection.execute('SHOW TABLES');
        console.log('\n📊 Current database indexes:');
        
        for (const table of tables) {
            const tableName = Object.values(table)[0];
            const [indexes] = await connection.execute(`SHOW INDEX FROM ${tableName}`);
            
            if (indexes.length > 0) {
                console.log(`\n📋 ${tableName}:`);
                indexes.forEach(index => {
                    console.log(`   - ${index.Key_name} (${index.Column_name})`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };