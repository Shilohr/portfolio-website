const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Handle API requests with mock data
  if (req.url.startsWith('/api/')) {
    handleApiRequest(req, res);
    return;
  }

  // Serve static files
  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

function handleApiRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Mock API responses
  if (req.url === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }));
    return;
  }

  if (req.url === '/api/projects') {
    res.writeHead(200);
    res.end(JSON.stringify({
      projects: [
        {
          id: 1,
          title: 'Space Portfolio Website',
          description: 'A modern retro space-themed portfolio website built with Node.js, Express, and vanilla JavaScript.',
          github_url: 'https://github.com/shilohrobinson/portfolio',
          live_url: 'https://shilohrobinson.dev',
          featured: true,
          status: 'active',
          technologies: ['JavaScript', 'Node.js', 'Express', 'MySQL', 'CSS3'],
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-20T15:30:00Z'
        },
        {
          id: 2,
          title: 'Cosmic Task Manager',
          description: 'A futuristic task management application with real-time collaboration features.',
          github_url: 'https://github.com/shilohrobinson/cosmic-tasks',
          live_url: 'https://cosmic-tasks.demo.com',
          featured: true,
          status: 'active',
          technologies: ['React', 'Node.js', 'Socket.io', 'MongoDB'],
          created_at: '2024-01-10T09:00:00Z',
          updated_at: '2024-01-18T12:00:00Z'
        },
        {
          id: 3,
          title: 'Stellar Weather Dashboard',
          description: 'A beautiful weather dashboard with space-themed visualizations and forecasts.',
          github_url: 'https://github.com/shilohrobinson/stellar-weather',
          featured: false,
          status: 'active',
          technologies: ['Vue.js', 'Chart.js', 'OpenWeather API', 'CSS3'],
          created_at: '2024-01-05T14:00:00Z',
          updated_at: '2024-01-16T08:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 3,
        pages: 1
      }
    }));
    return;
  }

  if (req.url === '/api/github/repos') {
    res.writeHead(200);
    res.end(JSON.stringify({
      repositories: [
        {
          id: 1,
          repo_id: '123456789',
          name: 'portfolio-website',
          full_name: 'shilohrobinson/portfolio-website',
          description: 'My personal portfolio website with a space theme',
          html_url: 'https://github.com/shilohrobinson/portfolio-website',
          stars: 42,
          forks: 8,
          language: 'JavaScript',
          topics: ['portfolio', 'nodejs', 'space-theme'],
          is_private: false,
          is_fork: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-20T12:00:00Z'
        },
        {
          id: 2,
          repo_id: '987654321',
          name: 'cosmic-tasks',
          full_name: 'shilohrobinson/cosmic-tasks',
          description: 'A futuristic task management app',
          html_url: 'https://github.com/shilohrobinson/cosmic-tasks',
          stars: 28,
          forks: 5,
          language: 'TypeScript',
          topics: ['task-management', 'react', 'typescript'],
          is_private: false,
          is_fork: false,
          created_at: '2023-12-15T00:00:00Z',
          updated_at: '2024-01-18T16:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        pages: 1
      }
    }));
    return;
  }

  // Mock auth endpoints
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    res.writeHead(200);
    res.end(JSON.stringify({
      message: 'Login successful',
      token: 'mock-jwt-token-12345',
      user: {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin'
      }
    }));
    return;
  }

  if (req.url === '/api/auth/register' && req.method === 'POST') {
    res.writeHead(201);
    res.end(JSON.stringify({
      message: 'User registered successfully',
      userId: 2
    }));
    return;
  }

  if (req.url === '/api/auth/profile') {
    res.writeHead(200);
    res.end(JSON.stringify({
      user: {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        created_at: '2024-01-01T00:00:00Z',
        last_login: '2024-01-20T10:00:00Z'
      }
    }));
    return;
  }

  // Default 404 for API
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  console.log('Frontend files are being served with mock API responses');
});