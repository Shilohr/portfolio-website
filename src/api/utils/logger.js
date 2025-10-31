const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { v4: uuidv4 } = require('uuid');

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * List of sensitive field names that should be redacted from logs
 * Prevents accidental exposure of passwords, tokens, and other secrets
 */
const sensitiveFields = [
  'password',
  'password_hash',
  'token',
  'authorization',
  'secret',
  'key',
  'api_key',
  'jwt_secret',
  'db_password',
  'session',
  'cookie'
];

/**
 * Sanitizes data objects by redacting sensitive information
 * Recursively processes nested objects and arrays to ensure no sensitive data leaks
 * @param {*} data - Data to sanitize (object, array, or primitive)
 * @returns {*} Sanitized data with sensitive fields replaced with '[REDACTED]'
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: isDevelopment ? data.stack : undefined,
      code: data.code
    };
  }
  
  const sanitized = { ...data };
  
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  };
  
  return sanitizeObject(sanitized);
};

const createLogger = () => {
  const transports = [];
  
  if (isProduction) {
    transports.push(
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        handleExceptions: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        handleExceptions: false,
        maxSize: '20m',
        maxFiles: '14d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    );
  } else {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      })
    );
  }
  
  const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
    ),
    defaultMeta: {
      service: 'portfolio-api',
      environment: process.env.NODE_ENV || 'development'
    },
    transports,
    exitOnError: false
  });
  
  return logger;
};

const logger = createLogger();

const requestContext = (req) => {
  if (!req) {
    return {
      requestId: uuidv4(),
      timestamp: new Date().toISOString()
    };
  }
  
  return {
    requestId: req.requestId || uuidv4(),
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get ? req.get('User-Agent') : undefined,
    userId: req.user?.userId,
    username: req.user?.username,
    timestamp: new Date().toISOString()
  };
};

const logWithRequest = (level, message, req, additionalData = {}) => {
  const context = requestContext(req);
  const sanitizedData = sanitizeData(additionalData);
  
  logger.log(level, message, {
    ...context,
    ...sanitizedData
  });
};

const structuredLogger = {
  error: (message, req = null, data = {}) => {
    if (req) {
      logWithRequest('error', message, req, data);
    } else {
      logger.error(message, sanitizeData(data));
    }
  },
  
  warn: (message, req = null, data = {}) => {
    if (req) {
      logWithRequest('warn', message, req, data);
    } else {
      logger.warn(message, sanitizeData(data));
    }
  },
  
  info: (message, req = null, data = {}) => {
    if (req) {
      logWithRequest('info', message, req, data);
    } else {
      logger.info(message, sanitizeData(data));
    }
  },
  
  debug: (message, req = null, data = {}) => {
    if (req) {
      logWithRequest('debug', message, req, data);
    } else {
      logger.debug(message, sanitizeData(data));
    }
  },
  
  audit: (action, req, resource = null, additionalData = {}) => {
    const context = requestContext(req);
    const auditData = {
      action,
      resource,
      timestamp: new Date().toISOString(),
      ...sanitizeData(additionalData)
    };
    
    logger.info(`AUDIT: ${action}`, {
      ...context,
      audit: auditData
    });
  },
  
  security: (event, req, severity = 'medium', additionalData = {}) => {
    const context = requestContext(req);
    const securityData = {
      securityEvent: event,
      severity,
      timestamp: new Date().toISOString(),
      ...sanitizeData(additionalData)
    };
    
    logger.warn(`SECURITY: ${event}`, {
      ...context,
      security: securityData
    });
  },
  
  performance: (operation, duration, req = null, additionalData = {}) => {
    const perfData = {
      operation,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...sanitizeData(additionalData)
    };
    
    if (req) {
      const context = requestContext(req);
      logger.info(`PERFORMANCE: ${operation}`, {
        ...context,
        performance: perfData
      });
    } else {
      logger.info(`PERFORMANCE: ${operation}`, { performance: perfData });
    }
  },
  
  database: (query, duration, error = null, additionalData = {}) => {
    const dbData = {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration: `${duration}ms`,
      error: error ? sanitizeData(error) : null,
      timestamp: new Date().toISOString(),
      ...sanitizeData(additionalData)
    };
    
    if (error) {
      logger.error('DATABASE_ERROR', { database: dbData });
    } else {
      logger.debug('DATABASE_QUERY', { database: dbData });
    }
  }
};

const requestLogger = (req, res, next) => {
  req.requestId = uuidv4();
  const startTime = Date.now();
  
  const context = requestContext(req);
  
  logger.info('REQUEST_START', {
    ...context,
    headers: sanitizeData(req.headers)
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseContext = {
      ...context,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    };
    
    if (res.statusCode >= 400) {
      logger.warn('REQUEST_COMPLETED_WITH_ERROR', responseContext);
    } else {
      logger.info('REQUEST_COMPLETED', responseContext);
    }
  });
  
  next();
};

module.exports = {
  logger: structuredLogger,
  requestLogger,
  sanitizeData,
  requestContext
};