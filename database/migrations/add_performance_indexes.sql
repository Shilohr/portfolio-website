-- Performance optimization indexes
-- Migration: Add composite indexes for common query patterns

-- Projects table indexes
ALTER TABLE projects 
ADD INDEX IF NOT EXISTS idx_projects_user_featured (user_id, featured),
ADD INDEX IF NOT EXISTS idx_projects_user_status_featured (user_id, status, featured),
ADD INDEX IF NOT EXISTS idx_projects_status_order (status, order_index),
ADD INDEX IF NOT EXISTS idx_projects_featured_order (featured, order_index),
ADD INDEX IF NOT EXISTS idx_projects_created (created_at),
ADD INDEX IF NOT EXISTS idx_projects_updated (updated_at);

-- GitHub repositories table indexes
ALTER TABLE github_repos 
ADD INDEX IF NOT EXISTS idx_github_repos_lang_updated (language, updated_at),
ADD INDEX IF NOT EXISTS idx_github_repos_private_fork (is_private, is_fork),
ADD INDEX IF NOT EXISTS idx_github_repos_stars_updated (stars, updated_at);

-- Project images table indexes
ALTER TABLE project_images 
ADD INDEX IF NOT EXISTS idx_project_images_project_primary (project_id, is_primary),
ADD INDEX IF NOT EXISTS idx_project_images_created (created_at);

-- User sessions optimization
ALTER TABLE user_sessions 
ADD INDEX IF NOT EXISTS idx_user_sessions_user_active_expires (user_id, is_active, expires_at);

-- Audit log optimization for recent queries
ALTER TABLE audit_log 
ADD INDEX IF NOT EXISTS idx_audit_log_recent (created_at DESC, action),
ADD INDEX IF NOT EXISTS idx_audit_log_user_recent (user_id, created_at DESC);

-- Project technologies optimization
ALTER TABLE project_technologies 
ADD INDEX IF NOT EXISTS idx_project_technologies_tech (technology),
ADD INDEX IF NOT EXISTS idx_project_technologies_project_tech (project_id, technology);

-- Analyze tables after adding indexes
ANALYZE TABLE projects;
ANALYZE TABLE github_repos;
ANALYZE TABLE project_images;
ANALYZE TABLE user_sessions;
ANALYZE TABLE audit_log;
ANALYZE TABLE project_technologies;