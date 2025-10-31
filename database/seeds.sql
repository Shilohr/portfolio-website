-- SECURITY NOTE: Default admin user removed for security
-- To create an admin user, run the following with a secure password:
-- INSERT INTO users (username, email, password_hash, role) VALUES 
-- ('admin', 'your-email@domain.com', '$2b$10$your-secure-hash-here', 'admin');
-- Generate password hash using: bcrypt.hashSync('your-secure-password', 10)

-- Insert sample projects
INSERT INTO projects (title, description, github_url, live_url, featured, order_index) VALUES 
('Portfolio Website', 'Modern retro space-themed portfolio website with GitHub integration', 'https://github.com/shilohrobinson/portfolio', 'https://shilohrobinson.dev', TRUE, 1),
('API Gateway', 'Microservices API gateway with authentication and rate limiting', 'https://github.com/shilohrobinson/api-gateway', NULL, FALSE, 2),
('Data Visualizer', 'Interactive data visualization dashboard with real-time updates', 'https://github.com/shilohrobinson/data-viz', 'https://viz.shilohrobinson.dev', FALSE, 3);

-- Add technologies for projects
INSERT INTO project_technologies (project_id, technology) VALUES 
(1, 'JavaScript'), (1, 'CSS3'), (1, 'HTML5'), (1, 'Docker'),
(2, 'Node.js'), (2, 'Express'), (2, 'JWT'), (2, 'Redis'),
(3, 'React'), (3, 'D3.js'), (3, 'WebSocket'), (3, 'MongoDB');