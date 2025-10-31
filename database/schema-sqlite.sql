-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'developer' CHECK (role IN ('admin', 'developer')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL,
    login_attempts INTEGER DEFAULT 0,
    locked_until DATETIME NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    github_url TEXT,
    live_url TEXT,
    featured INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Project technologies
CREATE TABLE IF NOT EXISTS project_technologies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    technology TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE (project_id, technology)
);

-- GitHub repositories cache
CREATE TABLE IF NOT EXISTS github_repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    description TEXT,
    html_url TEXT,
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    language TEXT,
    topics TEXT, -- JSON stored as TEXT in SQLite
    is_private INTEGER DEFAULT 0,
    is_fork INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Project images
CREATE TABLE IF NOT EXISTS project_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    alt_text TEXT,
    is_primary INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- User sessions for JWT tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit log for security
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id INTEGER,
    old_values TEXT, -- JSON stored as TEXT in SQLite
    new_values TEXT, -- JSON stored as TEXT in SQLite
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username_email ON users(username, email);
CREATE INDEX IF NOT EXISTS idx_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_featured ON projects(featured);
CREATE INDEX IF NOT EXISTS idx_order ON projects(order_index);
CREATE INDEX IF NOT EXISTS idx_stars ON github_repos(stars);
CREATE INDEX IF NOT EXISTS idx_language ON github_repos(language);
CREATE INDEX IF NOT EXISTS idx_updated ON github_repos(updated_at);
CREATE INDEX IF NOT EXISTS idx_last_sync ON github_repos(last_sync);
CREATE INDEX IF NOT EXISTS idx_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_action ON audit_log(user_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);