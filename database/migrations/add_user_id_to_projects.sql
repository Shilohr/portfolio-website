-- Migration: Add user_id column to projects table for ownership authorization
-- Date: 2025-10-31
-- Purpose: Implement database security fixes for project ownership

-- Add user_id column to projects table
ALTER TABLE projects 
ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;

-- Add foreign key constraint
ALTER TABLE projects 
ADD CONSTRAINT fk_projects_user_id 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add index for performance on user_id lookups
CREATE INDEX idx_projects_user_id ON projects(user_id);

-- Add composite index for user-specific queries
CREATE INDEX idx_projects_user_status ON projects(user_id, status);

-- Update existing projects to belong to first admin user (assuming user ID 1 exists)
-- This should be adjusted based on actual data
UPDATE projects SET user_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE user_id = 1;

-- Add comment for documentation
ALTER TABLE projects COMMENT = 'Projects table with user ownership for authorization';