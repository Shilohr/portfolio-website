# Project Structure

This document outlines the organized structure of the portfolio website project.

## Directory Structure

```
portfolio-website/
├── backup/                     # Backup and temporary files
├── config/                     # Configuration files
│   ├── .env.example           # Environment variables template
│   └── nginx.conf             # Nginx configuration
├── database/                   # Database schemas and migrations
│   ├── migrations/            # Database migration files
│   ├── schema.sql            # MySQL database schema
│   ├── schema-sqlite.sql     # SQLite database schema
│   ├── seeds.sql             # MySQL seed data
│   └── seeds-sqlite.sql      # SQLite seed data
├── docker/                     # Docker-related files
│   ├── Dockerfile             # Main Dockerfile
│   ├── Dockerfile.simple      # Simplified Dockerfile
│   ├── Dockerfile.working     # Working Dockerfile
│   ├── docker-compose.yml     # Main docker-compose
│   ├── docker-compose.simple.yml
│   ├── docker-compose.working.yml
│   └── docker-security.md     # Docker security documentation
├── docs/                       # Documentation
│   ├── PROJECT_STRUCTURE.md   # This file
│   ├── README.md              # Main project documentation
│   ├── README-FRONTEND.md     # Frontend documentation
│   ├── README-TESTING.md      # Testing documentation
│   ├── SECURITY_DEPLOYMENT.md # Security deployment guide
│   └── *.md                   # Other documentation files
├── public/                     # Static assets (served directly)
│   └── assets/               # Images and other static assets
│       └── images/           # Project images
├── scripts/                    # Build and deployment scripts
│   ├── build.sh              # Build script
│   ├── deploy.sh             # Deployment script
│   ├── generate-secrets.js   # Generate secrets
│   ├── migrate-performance.js # Performance migrations
│   ├── setup-production.sh   # Production setup
│   ├── start.sh              # Start script
│   ├── create-admin-local.js  # Local admin creation
│   └── debug-token.js        # Token debugging utility
├── src/                        # Source code
│   ├── api/                  # Backend API
│   │   ├── config/           # API configuration
│   │   │   └── logging.json  # Logging configuration
│   │   ├── routes/           # API route handlers
│   │   │   ├── auth.js       # Authentication routes
│   │   │   ├── github.js     # GitHub integration routes
│   │   │   └── projects.js   # Project management routes
│   │   ├── scripts/          # API utility scripts
│   │   │   ├── create-admin.js # Admin user creation
│   │   │   ├── monitor.js    # Monitoring script
│   │   │   └── production-monitor.js # Production monitoring
│   │   ├── tests/            # API tests
│   │   │   ├── performance/  # Performance tests
│   │   │   ├── security/     # Security tests
│   │   │   └── unit/         # Unit tests
│   │   ├── utils/            # API utilities
│   │   │   ├── cache.js      # Caching utilities
│   │   │   ├── config.js     # Configuration utilities
│   │   │   ├── csrf.js       # CSRF protection
│   │   │   ├── dbMaintenance.js # Database maintenance
│   │   │   ├── errorHandler.js # Error handling
│   │   │   ├── json-adapter.js # JSON database adapter
│   │   │   ├── logger.js     # Logging utilities
│   │   │   ├── performanceMonitor.js # Performance monitoring
│   │   │   ├── sqlite-adapter.js # SQLite database adapter
│   │   │   ├── transaction.js # Transaction handling
│   │   │   └── validation.js # Input validation
│   │   ├── jest.config.js    # Jest testing configuration
│   │   ├── package.json      # API dependencies
│   │   └── server.js         # Main API server
│   └── frontend/             # Frontend source
│       ├── js/               # JavaScript files
│       │   ├── modules/      # ES6 modules
│       │   │   ├── animations.js # Animation utilities
│       │   │   ├── api.js    # API communication
│       │   │   ├── core.js   # Core functionality
│       │   │   ├── performance.js # Performance optimizations
│       │   │   └── projects.js # Project-specific code
│       │   ├── utils/        # Utility functions
│       │   │   ├── helpers.js # General helpers
│       │   │   ├── lazy-loader.js # Lazy loading
│       │   │   └── security.js # Security utilities
│       │   ├── admin.js      # Admin panel functionality
│       │   ├── auth.js       # Authentication handling
│       │   ├── bundle-analyzer.js # Bundle analysis
│       │   ├── lazy-loader.js # Lazy loading implementation
│       │   ├── main.js       # Main application entry
│       │   ├── performance.js # Performance monitoring
│       │   └── projects.js   # Project management
│       ├── tests/            # Frontend tests
│       │   ├── frontend.test.html # Frontend test runner
│       │   └── setup-tests.js # Test setup
│       ├── admin.html        # Admin panel
│       ├── admin.css         # Admin styles
│       ├── index.html        # Main page
│       ├── login.html        # Login page
│       ├── projects.html     # Projects page
│       ├── style.css         # Main styles
│       └── test-frontend.html # Frontend testing
├── tests/                      # Integration and system tests
│   ├── test-db-query.js      # Database query tests
│   ├── test-docker-security.sh # Docker security tests
│   ├── test-login-simple.js  # Simple login tests
│   └── test-query-container.js # Container query tests
├── .gitignore                 # Git ignore file
├── package.json               # Main project dependencies
└── portfolio.json             # JSON database file
```

## Key Changes Made

### 1. **Frontend Organization**
- Moved HTML, CSS, and JS files from `public/` to `src/frontend/`
- Organized JavaScript into `modules/` and `utils/` directories
- Separated frontend tests into `src/frontend/tests/`

### 2. **API Organization**
- Moved route handlers (`auth.js`, `projects.js`, `github.js`) to `src/api/routes/`
- Consolidated utility scripts in `src/api/scripts/`
- Organized tests by type (performance, security, unit)

### 3. **Configuration Management**
- Moved configuration files to `config/` directory
- Centralized environment variables template
- Organized Docker and Nginx configurations

### 4. **Documentation**
- Consolidated all documentation in `docs/` directory
- Maintained separate README files for different aspects
- Added this project structure documentation

### 5. **Cleanup**
- Moved backup and temporary files to `backup/` directory
- Consolidated test files in `tests/` directory
- Removed duplicate and obsolete files

## Development Workflow

### Frontend Development
- Source files are in `src/frontend/`
- Static assets are served from `public/`
- Tests can be run from `src/frontend/tests/`

### Backend Development
- API source is in `src/api/`
- Route handlers are in `src/api/routes/`
- Utilities are in `src/api/utils/`
- Tests are organized in `src/api/tests/`

### Deployment
- Docker files are in `docker/`
- Configuration is in `config/`
- Scripts are in `scripts/`

## Benefits of This Structure

1. **Separation of Concerns**: Frontend and backend are clearly separated
2. **Scalability**: Easy to add new features and modules
3. **Maintainability**: Logical organization makes code easier to find and maintain
4. **Testing**: Tests are organized by type and location
5. **Deployment**: All deployment-related files are centralized
6. **Documentation**: Comprehensive documentation in one location

## Notes

- The `public/` directory now contains only static assets that are served directly
- Environment configuration is centralized in `config/`
- All backup and temporary files are isolated in `backup/`
- The structure supports both development and production workflows