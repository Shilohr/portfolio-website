-- Insert sample projects (user_id will be 1 for now)
INSERT INTO projects (user_id, title, description, github_url, live_url, featured, order_index) VALUES 
(1, 'Portfolio Website', 'Modern retro space-themed portfolio website with GitHub integration', 'https://github.com/shilohrobinson/portfolio', 'https://shilohrobinson.dev', 1, 1),
(1, 'API Gateway', 'Microservices API gateway with authentication and rate limiting', 'https://github.com/shilohrobinson/api-gateway', NULL, 0, 2),
(1, 'Data Visualizer', 'Interactive data visualization dashboard with real-time updates', 'https://github.com/shilohrobinson/data-viz', 'https://viz.shilohrobinson.dev', 0, 3);

-- Add technologies for projects
INSERT INTO project_technologies (project_id, technology) VALUES 
(1, 'JavaScript'), (1, 'CSS3'), (1, 'HTML5'), (1, 'Docker'),
(2, 'Node.js'), (2, 'Express'), (2, 'JWT'), (2, 'Redis'),
(3, 'React'), (3, 'D3.js'), (3, 'WebSocket'), (3, 'MongoDB');

-- Create a default user (password: 'password123' - change in production!)
INSERT INTO users (username, email, password_hash, role) VALUES 
('shiloh', 'shiloh@example.com', '$2b$10$rQZ8ZHWKQJvKXyZjQZQGKOqZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ', 'admin');