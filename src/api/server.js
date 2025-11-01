const express = require('express');
const path = require('path');
// Database adapters will be imported conditionally based on DB_TYPE
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const dotenv = require('dotenv');
const { logger, requestLogger } = require('./utils/logger');
const { validateConfig } = require('./utils/config');
const { csrfProtection, smartCsrfProtection, csrfTokenMiddleware, getCsrfToken, csrfErrorHandler } = require('./utils/csrf');
const { errorHandler, sendSuccess, sendError } = require('./utils/errorHandler');
const { commonValidations, handleValidationErrors } = require('./utils/validation');
const DatabaseMaintenance = require('./utils/dbMaintenance');
// Load environment variables before requiring modules that depend on them
dotenv.config({ path: path.resolve(__dirname, '../../../config/.env') });

const { cache } = require('./utils/cache');
const { performanceMonitor, requestMonitor, monitorQuery } = require('./utils/performanceMonitor');

// Cache for processed HTML templates to avoid repeated file I/O
const htmlCache = new Map();
const authRoutes = require('./routes/auth');
const projectsRoutes = require('./routes/projects');
const githubRoutes = require('./routes/github');
const { authenticateToken, requireAdmin } = require('./routes/auth');

// Validate environment configuration on startup
let config;
try {
    const validation = validateConfig();
    config = validation.envVars;
    
    logger.info('Environment configuration validated successfully', null, {
        environment: config.NODE_ENV,
        port: config.PORT,
        securityEnabled: config.NODE_ENV === 'production'
    });
    
    // Log configuration summary (without exposing secrets)
    logger.info('Configuration validated', null, validation.configStatus);
    
} catch (error) {
    // Use console.error here since logger might not be properly initialized during config validation failure
    console.error('Environment validation failed:');
    console.error(error.message);
    console.error('\nTo fix this issue:');
    console.error('1. Copy .env.example to .env');
    console.error('2. Fill in the required environment variables');
    console.error('3. For production, run: node scripts/setup.js');
    console.error('4. Ensure all secrets are cryptographically secure');
    process.exit(1);
}

const app = express();
const PORT = config.PORT;

// Trust proxy for nginx (specific IP ranges for security)
app.set('trust proxy', ['127.0.0.1', '::1']);

// HTTPS enforcement in production with host validation
if (config.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            const requestHost = req.header('host');
            const allowedHosts = config.ALLOWED_HOSTS ? config.ALLOWED_HOSTS.split(',').map(h => h.trim()) : [];
            
            // Validate host header against allowlist
            if (allowedHosts.includes(requestHost)) {
                res.redirect(`https://${requestHost}${req.url}`);
            } else {
                logger.warn('Invalid host header in HTTPS redirect', req, {
                    host: requestHost,
                    allowedHosts: allowedHosts,
                    url: req.url
                });
                res.status(400).json({ 
                    error: 'Bad Request',
                    message: 'Invalid host header'
                });
            }
        } else {
            next();
        }
    });
}

// Generate nonce for CSP
const generateNonce = () => {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('base64');
};

// Security middleware
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: config.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    } : false
};

if (config.NODE_ENV === 'production') {
    helmetConfig.crossOriginEmbedderPolicy = true;
    helmetConfig.crossOriginResourcePolicy = { policy: "cross-origin" };
}

// CSP nonce middleware
app.use((req, res, next) => {
    const nonce = generateNonce();
    res.locals.nonce = nonce;
    
    // Dynamically update CSP with nonce
    const cspConfig = {
        ...helmetConfig,
        contentSecurityPolicy: {
            directives: {
                ...helmetConfig.contentSecurityPolicy.directives,
                styleSrc: ["'self'", `'nonce-${nonce}'`],
                scriptSrc: ["'self'", `'nonce-${nonce}'`],
            }
        }
    };
    
    // Apply helmet with dynamic CSP
    helmet(cspConfig)(req, res, next);
});

// CORS configuration
const corsOptions = {
    credentials: true,
    optionsSuccessStatus: 200
};

if (config.NODE_ENV === 'production') {
    corsOptions.origin = [config.CORS_ORIGIN || 'https://shilohrobinson.dev'];
    corsOptions.methods = ['GET', 'POST', 'PUT', 'DELETE'];
    corsOptions.allowedHeaders = ['Content-Type', 'Authorization'];
    corsOptions.maxAge = 86400; // 24 hours
} else {
    corsOptions.origin = ['http://localhost:8080', 'http://localhost:3000'];
}

app.use(cors(corsOptions));

// Rate limiting
const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
};

if (config.NODE_ENV === 'production') {
    rateLimitConfig.max = config.RATE_LIMIT_MAX_REQUESTS; // Use config value
    rateLimitConfig.skip = (req) => {
        // Skip rate limiting for health checks
        return req.path === '/api/health';
    };
} else {
    rateLimitConfig.max = config.RATE_LIMIT_MAX_REQUESTS; // Use config value
}

const limiter = rateLimit(rateLimitConfig);
app.use('/api/', limiter);

// Additional stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.AUTH_RATE_LIMIT_MAX,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Request logging middleware
app.use(requestLogger);

// Performance monitoring middleware
app.use(requestMonitor);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser for CSRF tokens
app.use(cookieParser());



// Apply smart CSRF protection to all state-changing routes
// Bypasses CSRF for requests with Authorization headers or in test environment
app.use('/api/auth/login', smartCsrfProtection);
app.use('/api/auth/register', smartCsrfProtection);
app.use('/api/projects', csrfTokenMiddleware);
app.use('/api/github', csrfTokenMiddleware);
app.use('/api/auth/logout', smartCsrfProtection);
app.use('/api/admin/cache', smartCsrfProtection);
app.use('/api/admin/maintenance', smartCsrfProtection);

// Database connection - branch based on DB_TYPE configuration
let pool;
try {
    switch (config.DB_TYPE) {
        case 'mysql':
            const mysql = require('mysql2/promise');
            pool = mysql.createPool({
                host: config.DB_HOST,
                user: config.DB_USER,
                password: config.DB_PASSWORD,
                database: config.DB_NAME,
                connectionLimit: 10,
                acquireTimeout: 60000,
                timeout: 60000,
                reconnect: true,
                charset: 'utf8mb4'
            });
            logger.info('MySQL database pool initialized', null, {
                host: config.DB_HOST,
                database: config.DB_NAME,
                user: config.DB_USER
            });
            break;
            
        case 'sqlite':
            const { createPool: createSQLitePool } = require('./utils/sqlite-adapter');
            pool = createSQLitePool({
                database: process.env.DB_PATH || 'portfolio.db'
            });
            logger.info('SQLite database pool initialized', null, {
                database: process.env.DB_PATH || 'portfolio.db'
            });
            break;
            
        case 'json':
        default:
            const { createPool: createJSONPool } = require('./utils/json-adapter');
            pool = createJSONPool({
                database: process.env.DB_PATH || 'portfolio.json'
            });
            logger.info('JSON database pool initialized', null, {
                database: process.env.DB_PATH || 'portfolio.json',
                fallback: config.DB_TYPE !== 'json' ? 'fallback adapter' : 'configured adapter'
            });
            break;
    }
} catch (error) {
    logger.error('Database initialization failed', error, {
        dbType: config.DB_TYPE,
        nodeEnv: config.NODE_ENV
    });
    
    // In development/test, fall back to JSON adapter if primary adapter fails
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
        logger.warn('Falling back to JSON adapter due to initialization error', null, {
            originalDbType: config.DB_TYPE,
            error: error.message
        });
        const { createPool: createJSONPool } = require('./utils/json-adapter');
        pool = createJSONPool({
            database: process.env.DB_PATH || 'portfolio.json'
        });
    } else {
        // In production, fail fast if database initialization fails
        throw new Error(`Database initialization failed for ${config.DB_TYPE}: ${error.message}`);
    }
}

// Database connection pool monitoring
pool.on('connection', (connection) => {
    logger.info('New database connection established', null, {
        connectionId: connection.threadId || 'unknown',
        timestamp: new Date().toISOString()
    });
});

pool.on('acquire', (connection) => {
    logger.debug('Connection acquired from pool', null, {
        connectionId: connection.threadId || 'unknown',
        activeConnections: pool._allConnections?.length || 0,
        freeConnections: pool._freeConnections?.length || 0
    });
});

pool.on('release', (connection) => {
    logger.debug('Connection released to pool', null, {
        connectionId: connection.threadId || 'unknown',
        activeConnections: pool._allConnections?.length || 0,
        freeConnections: pool._freeConnections?.length || 0
    });
});

pool.on('enqueue', () => {
    logger.debug('Connection request queued', null, {
        queueLength: pool._connectionQueue?.length || 0,
        activeConnections: pool._allConnections?.length || 0,
        freeConnections: pool._freeConnections?.length || 0
    });
});

// Initialize database maintenance (only for MySQL/SQLite databases)
let dbMaintenance = null;
if (config.DB_TYPE === 'mysql' || config.DB_TYPE === 'sqlite') {
    try {
        dbMaintenance = new DatabaseMaintenance(pool);
        logger.info('Database maintenance initialized', null, { dbType: config.DB_TYPE });
    } catch (error) {
        logger.warn('Database maintenance initialization failed', error, { 
            dbType: config.DB_TYPE,
            error: error.message 
        });
        // Continue without maintenance - non-critical for basic operation
    }
} else {
    logger.info('Database maintenance skipped', null, { 
        reason: 'JSON adapter does not require maintenance',
        dbType: config.DB_TYPE 
    });
}

// Periodic pool health monitoring (only for MySQL pools)
if (config.DB_TYPE === 'mysql') {
    setInterval(() => {
        // Only monitor pool stats if MySQL-specific properties are available
        if (pool._allConnections && pool._freeConnections && pool._connectionQueue) {
            const poolStats = {
                totalConnections: pool._allConnections.length,
                freeConnections: pool._freeConnections.length,
                queuedRequests: pool._connectionQueue.length,
                connectionLimit: pool.config?.connectionLimit || 'unknown',
                timestamp: new Date().toISOString()
            };
            
            logger.info('MySQL pool health check', null, poolStats);
            
            // Alert if pool is under stress
            if (poolStats.queuedRequests > 0) {
                logger.warn('MySQL pool under stress', null, {
                    ...poolStats,
                    alert: 'High queue length detected'
                });
            }
        }
    }, 300000); // Check every 5 minutes
}

// Scheduled database maintenance tasks (only for MySQL/SQLite databases)
if (config.NODE_ENV === 'production' && dbMaintenance) {
    // Daily cleanup of expired sessions (runs at 2 AM)
    setInterval(async () => {
        const now = new Date();
        if (now.getHours() === 2 && now.getMinutes() === 0) {
            try {
                await dbMaintenance.cleanupExpiredSessions();
                logger.info('Daily session cleanup completed', null, { 
                    timestamp: now.toISOString(),
                    dbType: config.DB_TYPE
                });
            } catch (error) {
                logger.error('Daily session cleanup failed', null, { 
                    error: error.message,
                    dbType: config.DB_TYPE
                });
            }
        }
    }, 60000); // Check every minute

    // Weekly table optimization (runs on Sunday at 3 AM) - MySQL only
    if (config.DB_TYPE === 'mysql') {
        setInterval(async () => {
            const now = new Date();
            if (now.getDay() === 0 && now.getHours() === 3 && now.getMinutes() === 0) {
                try {
                    await dbMaintenance.optimizeTables();
                    logger.info('Weekly table optimization completed', null, { 
                        timestamp: now.toISOString(),
                        dbType: config.DB_TYPE
                    });
                } catch (error) {
                    logger.error('Weekly table optimization failed', null, { 
                        error: error.message,
                        dbType: config.DB_TYPE
                    });
                }
            }
        }, 60000); // Check every minute
    }

    // Monthly partition management (runs on 1st of month at 4 AM) - MySQL only
    if (config.DB_TYPE === 'mysql') {
        setInterval(async () => {
            const now = new Date();
            if (now.getDate() === 1 && now.getHours() === 4 && now.getMinutes() === 0) {
                try {
                    const currentYear = now.getFullYear();
                    await dbMaintenance.createAuditLogPartition(currentYear + 1);
                    await dbMaintenance.dropOldPartitions();
                    logger.info('Monthly partition management completed', null, { 
                        timestamp: now.toISOString(),
                        year: currentYear,
                        dbType: config.DB_TYPE
                    });
                } catch (error) {
                    logger.error('Monthly partition management failed', null, { 
                        error: error.message,
                        dbType: config.DB_TYPE
                    });
                }
            }
        }, 60000); // Check every minute
    }
}

// Make database available to routes with performance monitoring

// Database connection middleware - MUST be before routes that need database access
// Only apply to API routes to avoid unnecessary connections for static assets
app.use('/api/', async (req, res, next) => {
    try {
        const connection = await pool.getConnection();
        req.db = connection; // Temporarily bypass monitorQuery
        
        // Ensure connection is released when response finishes
        res.on('finish', () => {
            if (connection && typeof connection.release === 'function') {
                connection.release();
            }
        });
        
        // Also release on close (for aborted requests)
        res.on('close', () => {
            if (connection && typeof connection.release === 'function') {
                connection.release();
            }
        });
        
        next();
    } catch (error) {
        logger.error('Database connection failed', error);
        sendError(res, 'DATABASE_ERROR', 'Database connection failed');
    }
});

// CSRF token endpoint (needs database access)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    // Set additional security headers for the token endpoint
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    
    res.json({ 
        csrfToken: req.csrfToken(),
        timestamp: Date.now()
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/github', githubRoutes);

/**
 * Health check endpoint with comprehensive database monitoring
 * Tests database connectivity and provides connection pool statistics
 * Used by load balancers and monitoring systems to verify service health
 */
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection with simple query
        const dbTest = await pool.query('SELECT 1 as test');
        
        // Get comprehensive pool statistics for monitoring
        // Handle different database pool types
        let poolStats;
        switch (config.DB_TYPE) {
            case 'mysql':
                if (pool._allConnections) {
                    poolStats = {
                        type: 'MySQL Pool',
                        totalConnections: pool._allConnections.length,
                        freeConnections: pool._freeConnections.length,
                        queuedRequests: pool._connectionQueue.length,
                        connectionLimit: pool.config.connectionLimit
                    };
                } else {
                    poolStats = { type: 'MySQL Pool', status: 'unknown' };
                }
                break;
            case 'sqlite':
                poolStats = {
                    type: 'SQLite Pool',
                    connected: pool.connected,
                    database: pool.adapter?.dbPath || 'unknown'
                };
                break;
            case 'json':
            default:
                poolStats = {
                    type: 'JSON Adapter',
                    connected: pool.connected,
                    database: pool.sharedAdapter?.dbPath || 'unknown'
                };
                break;
        }
        
        // Handle different result formats from different adapters
        let testResult;
        if (Array.isArray(dbTest) && dbTest.length > 0 && Array.isArray(dbTest[0]) && dbTest[0].length > 0) {
            // MySQL-style result: [[{test: 1}]]
            testResult = dbTest[0][0].test === 1;
        } else if (Array.isArray(dbTest) && dbTest.length > 0 && dbTest[0].test === 1) {
            // JSON adapter result: [{test: 1}]
            testResult = dbTest[0].test === 1;
        } else {
            testResult = false;
        }
        
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config.NODE_ENV,
            database: {
                status: 'connected',
                testResult: testResult,
                pool: poolStats
            }
        });
    } catch (error) {
        logger.error('Health check failed', req, { error: error.message });
        res.status(503).json({ 
            status: 'unhealthy', 
            timestamp: new Date().toISOString(),
            error: 'Database connection failed'
        });
    }
});

/**
 * Cache management endpoint for administrative operations
 * Supports clearing, invalidating, and getting cache statistics
 * Requires admin privileges and proper validation
 */
app.post('/api/admin/cache', [
    authenticateToken,
    requireAdmin,
    commonValidations.cacheOperation,
    handleValidationErrors
], async (req, res) => {
    try {
        const { operation, category, pattern } = req.body;
        
        let result;
        switch (operation) {
            case 'clear':
                if (category) {
                    cache.clear(category);
                    result = { cleared: category };
                } else {
                    cache.clear();
                    result = { cleared: 'all' };
                }
                break;
            case 'invalidate':
                if (pattern) {
                    const deletedCount = cache.invalidatePattern(pattern);
                    result = { invalidated: pattern, deletedCount };
                } else {
                    return sendError(res, 'VALIDATION_ERROR', 'Pattern is required for invalidate operation');
                }
                break;
            case 'stats':
                result = cache.getStats();
                break;
            default:
                return sendError(res, 'VALIDATION_ERROR', 'Invalid cache operation');
        }
        
        logger.info('Cache management operation completed', req, { 
            operation, 
            result 
        });
        
        res.json({ success: true, operation, result });
        
    } catch (error) {
        logger.error('Cache management operation failed', req, { 
            operation: req.body.operation, 
            error: error.message 
        });
        sendError(res, 'INTERNAL_ERROR', 'Cache management operation failed');
    }
});

/**
 * Performance monitoring endpoint for administrative metrics
 * Provides comprehensive performance statistics and monitoring data
 * Requires admin privileges for access
 */
app.get('/api/admin/performance', [
    authenticateToken,
    requireAdmin
], async (req, res) => {
    try {
        const summary = performanceMonitor.getSummary();
        
        res.json({ 
            success: true, 
            performance: summary 
        });
        
    } catch (error) {
        logger.error('Performance monitoring failed', req, { 
            error: error.message 
        });
        sendError(res, 'INTERNAL_ERROR', 'Performance monitoring failed');
    }
});

/**
 * Database maintenance endpoint for administrative operations
 * Supports session cleanup, table optimization, and partition management
 * Requires admin privileges and comprehensive validation
 */
app.post('/api/admin/maintenance', [
    authenticateToken,
    requireAdmin,
    commonValidations.maintenanceOperation,
    commonValidations.year,
    commonValidations.yearsToKeep,
    handleValidationErrors
], async (req, res) => {
    try {
        const { operation, year, yearsToKeep } = req.body;
        
        // Check if maintenance is available for this database type
        if (!dbMaintenance) {
            return sendError(res, 'DATABASE_ERROR', `Database maintenance not available for ${config.DB_TYPE} database`);
        }
        
        let result;
        switch (operation) {
            case 'cleanup-sessions':
                result = await dbMaintenance.cleanupExpiredSessions();
                break;
            case 'optimize-tables':
                if (config.DB_TYPE !== 'mysql') {
                    return sendError(res, 'DATABASE_ERROR', 'Table optimization is only available for MySQL databases');
                }
                result = await dbMaintenance.optimizeTables();
                break;
            case 'create-partition':
                if (config.DB_TYPE !== 'mysql') {
                    return sendError(res, 'DATABASE_ERROR', 'Partition management is only available for MySQL databases');
                }
                {
                    const partitionYear = req.body.year || new Date().getFullYear() + 1;
                    result = await dbMaintenance.createAuditLogPartition(partitionYear);
                }
                break;
            case 'drop-old-partitions':
                if (config.DB_TYPE !== 'mysql') {
                    return sendError(res, 'DATABASE_ERROR', 'Partition management is only available for MySQL databases');
                }
                {
                    const keepYears = req.body.yearsToKeep || 3;
                    result = await dbMaintenance.dropOldPartitions(keepYears);
                }
                break;
            case 'metrics':
                result = await dbMaintenance.getPerformanceMetrics();
                break;
            default:
                return sendError(res, 'VALIDATION_ERROR', 'Invalid maintenance operation');
        }
        
        logger.info('Database maintenance operation completed', req, { 
            operation, 
            result,
            dbType: config.DB_TYPE
        });
        
        res.json({ success: true, operation, result, dbType: config.DB_TYPE });
        
    } catch (error) {
        logger.error('Database maintenance operation failed', req, { 
            operation: req.body.operation, 
            error: error.message,
            dbType: config.DB_TYPE
        });
        sendError(res, 'DATABASE_ERROR', 'Maintenance operation failed');
    }
});

/**
 * Serves HTML pages with injected CSRF token and CSP nonce
 * Dynamically injects CSRF token and CSP nonce into meta tags for frontend security
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} htmlFile - HTML file to serve
 */
async function serveHtmlWithCSRF(req, res, htmlFile) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
        // Check if template is cached
        if (!htmlCache.has(htmlFile)) {
            const filePath = path.join(__dirname, '../frontend', htmlFile);
            let html = await fs.readFile(filePath, 'utf8');
            
            // Check if CSRF token meta tag exists, if not add it
            if (!html.includes('csrf-token')) {
                // Add CSRF token meta tag after other meta tags
                const metaInsertPoint = html.indexOf('</head>');
                if (metaInsertPoint !== -1) {
                    html = html.substring(0, metaInsertPoint) + 
                        '    <meta name="csrf-token" id="csrf-token" content="">\n' + 
                        html.substring(metaInsertPoint);
                }
            }
            
            // Check if CSP nonce meta tag exists, if not add it
            if (!html.includes('csp-nonce')) {
                // Add CSP nonce meta tag after other meta tags
                const metaInsertPoint = html.indexOf('</head>');
                if (metaInsertPoint !== -1) {
                    html = html.substring(0, metaInsertPoint) + 
                        '    <meta name="csp-nonce" id="csp-nonce" content="">\n' + 
                        html.substring(metaInsertPoint);
                }
            }
            
            // Cache the processed template
            htmlCache.set(htmlFile, html);
        }
        
        // Get cached template
        let html = htmlCache.get(htmlFile);
        
        // Inject dynamic values (CSRF token and CSP nonce)
        const csrfToken = req.csrfToken();
        html = html.replace(
            '<meta name="csrf-token" id="csrf-token" content="">',
            `<meta name="csrf-token" id="csrf-token" content="${csrfToken}">`
        );
        
        // Inject CSP nonce into meta tag for JavaScript access
        const nonce = res.locals.nonce;
        html = html.replace(
            '<meta name="csp-nonce" id="csp-nonce" content="">',
            `<meta name="csp-nonce" id="csp-nonce" content="${nonce}">`
        );
        
        // Inject nonce into all inline script tags
        // This handles both regular scripts and JSON-LD structured data
        html = html.replace(
            /<script(?![^>]*src)([^>]*)>/g,
            (match, attributes) => {
                // Check if nonce attribute already exists
                if (attributes.includes('nonce=')) {
                    return match;
                }
                // Add nonce attribute
                return `<script nonce="${nonce}"${attributes}>`;
            }
        );
        
        res.send(html);
    } catch (error) {
        logger.error(`Failed to serve ${htmlFile}`, req, { error: error.message });
        sendError(res, 'INTERNAL_ERROR', 'Internal server error');
    }
}

/**
 * Serves the main index.html with injected CSRF token
 */
app.get('/', csrfProtection, async (req, res) => {
    await serveHtmlWithCSRF(req, res, 'index.html');
});

/**
 * Serves login.html with injected CSRF token
 */
app.get('/login.html', csrfProtection, async (req, res) => {
    await serveHtmlWithCSRF(req, res, 'login.html');
});

// Static file serving - serve assets only, not HTML files
// This ensures dynamic routes with CSRF protection are handled first
app.use(express.static(path.join(__dirname, '../../public'), {
    // Don't serve index.html or login.html from static middleware
    // Let the dynamic routes handle those with CSRF protection
    index: false,
    setHeaders: (res, path) => {
        // Only serve static assets, not HTML files
        if (path.endsWith('.html')) {
            res.status(404).end();
        }
    }
}));

// Standardized error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    logger.warn('Route not found', req, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip
    });
    sendError(res, 'NOT_FOUND', 'Route not found');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully', null, { 
        signal: 'SIGTERM',
        action: 'shutdown'
    });
    await pool.end();
    process.exit(0);
});

app.listen(PORT, () => {
    const startupInfo = {
        port: PORT,
        environment: config.NODE_ENV,
        nodeVersion: process.version,
        pid: process.pid
    };
    
    logger.info('Portfolio API server started', null, startupInfo);
    
    if (config.NODE_ENV === 'production') {
        logger.info('Security features enabled', null, {
            features: [
                'HTTPS enforcement',
                'Strict CORS policy',
                'Enhanced rate limiting',
                'Security headers',
                'Structured logging'
            ]
        });
    } else {
        logger.info('Development mode configuration', null, {
            mode: 'development',
            security: 'relaxed',
            logging: 'structured'
        });
    }
});