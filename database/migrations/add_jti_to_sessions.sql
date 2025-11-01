-- Add jti (JWT ID) column to user_sessions for fast session lookup
-- This fixes the expensive session verification vulnerability

ALTER TABLE user_sessions ADD COLUMN jti VARCHAR(32) UNIQUE NOT NULL DEFAULT '';

-- Create index for fast jti lookup
CREATE INDEX idx_user_sessions_jti ON user_sessions(jti);

-- Create composite index for user + jti lookup (even faster)
CREATE INDEX idx_user_sessions_user_jti ON user_sessions(user_id, jti);