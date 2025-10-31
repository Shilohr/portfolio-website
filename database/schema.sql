-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'developer') DEFAULT 'developer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP NULL,
    INDEX idx_users_username_email (username, email)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    github_url VARCHAR(500),
    live_url VARCHAR(500),
    featured BOOLEAN DEFAULT FALSE,
    order_index INT DEFAULT 0,
    status ENUM('active', 'archived', 'draft') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_featured (featured),
    INDEX idx_order (order_index),
    INDEX idx_projects_status_featured (status, featured),
    INDEX idx_projects_user_status (user_id, status),
    INDEX idx_projects_user_featured (user_id, featured),
    INDEX idx_projects_user_status_featured (user_id, status, featured),
    INDEX idx_projects_status_order (status, order_index),
    INDEX idx_projects_featured_order (featured, order_index),
    INDEX idx_projects_created (created_at),
    INDEX idx_projects_updated (updated_at)
);

-- Project technologies
CREATE TABLE IF NOT EXISTS project_technologies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    technology VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE KEY unique_project_tech (project_id, technology)
);

-- GitHub repositories cache
CREATE TABLE IF NOT EXISTS github_repos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    repo_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    full_name VARCHAR(300),
    description TEXT,
    html_url VARCHAR(500),
    stars INT DEFAULT 0,
    forks INT DEFAULT 0,
    language VARCHAR(50),
    topics JSON,
    is_private BOOLEAN DEFAULT FALSE,
    is_fork BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stars (stars),
    INDEX idx_language (language),
    INDEX idx_updated (updated_at),
    INDEX idx_github_repos_sync (last_sync),
    INDEX idx_github_repos_name (name),
    INDEX idx_github_repos_stars_lang (stars, language),
    INDEX idx_github_repos_lang_updated (language, updated_at),
    INDEX idx_github_repos_private_fork (is_private, is_fork),
    INDEX idx_github_repos_stars_updated (stars, updated_at)
);

-- Project images
CREATE TABLE IF NOT EXISTS project_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(200),
    is_primary BOOLEAN DEFAULT FALSE,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_images_project_id (project_id),
    INDEX idx_project_images_primary (is_primary),
    INDEX idx_project_images_order (project_id, order_index),
    INDEX idx_project_images_project_primary (project_id, is_primary),
    INDEX idx_project_images_created (created_at)
);

-- User sessions for JWT tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token_hash),
    INDEX idx_expires (expires_at),
    INDEX idx_user_sessions_user_active (user_id, is_active),
    INDEX idx_user_sessions_ip (ip_address),
    INDEX idx_user_sessions_cleanup (expires_at, is_active)
);

-- Audit log for security (partitioned by year)
CREATE TABLE IF NOT EXISTS audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_action (user_id, action),
    INDEX idx_created (created_at),
    INDEX idx_audit_log_user_created (user_id, created_at),
    INDEX idx_audit_log_action_resource (action, resource_type),
    INDEX idx_audit_log_ip_time (ip_address, created_at)
)
PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);