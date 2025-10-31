# Structured Logging System

This document describes the comprehensive structured logging system implemented for the portfolio API.

## Overview

The logging system provides:
- **Structured JSON logging** for production environments
- **Sensitive data filtering** to prevent leaks
- **Request correlation tracking** with unique IDs
- **Performance monitoring** and metrics
- **Security event logging** and audit trails
- **Automated log rotation** and cleanup
- **Production monitoring** with alerts

## Configuration

### Environment-based Configuration

The logging system automatically configures itself based on `NODE_ENV`:

- **Production**: JSON format with file rotation
- **Development**: Colorized console output
- **Test**: Minimal console output

### Log Levels

- `error`: Error conditions that need immediate attention
- `warn`: Warning conditions that should be investigated
- `info`: General information about system operation
- `debug`: Detailed debugging information

## Usage

### Basic Logging

```javascript
const { logger } = require('./utils/logger');

// Simple logging
logger.info('Server started');
logger.error('Database connection failed', null, { error: details });

// With request context
logger.info('User logged in', req, { userId: user.id });
```

### Specialized Logging Methods

#### Audit Logging
```javascript
logger.audit('USER_LOGIN', req, 'user', { 
  userId: user.id, 
  username: user.username 
});
```

#### Security Events
```javascript
logger.security('LOGIN_ATTEMPT_FAILED', req, 'medium', { 
  username, 
  reason: 'Invalid password' 
});
```

#### Performance Monitoring
```javascript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;

logger.performance('DATABASE_QUERY', duration, req, { 
  query: 'SELECT * FROM users' 
});
```

#### Database Operations
```javascript
logger.database('SELECT * FROM users', 150, null, { 
  rowCount: 10 
});
```

## Request Context

All API requests automatically include:
- `requestId`: Unique correlation ID
- `method`: HTTP method
- `url`: Request URL
- `ip`: Client IP address
- `userAgent`: Browser/user agent
- `userId`: Authenticated user ID (if available)
- `username`: Authenticated username (if available)

## Sensitive Data Filtering

The system automatically redacts sensitive fields:
- `password`, `password_hash`
- `token`, `authorization`
- `secret`, `key`, `api_key`
- `jwt_secret`, `db_password`
- `session`, `cookie`

## Log Files

### Production Structure
```
logs/
├── error-2023-10-30.log     # Error-level logs
├── combined-2023-10-30.log  # All logs
└── log-report-2023-10-30.json # Daily reports
```

### Rotation
- **Max file size**: 20MB
- **Retention**: 14 days
- **Date pattern**: YYYY-MM-DD

## Monitoring and Reports

### Generate Reports
```bash
# Generate report for specific date
npm run logs:report 2023-10-30

# Generate report for yesterday
npm run logs:report

# Clean up old logs
npm run logs:cleanup
```

### Production Monitoring
```bash
# Start monitoring service (runs in background)
npm run monitor:start

# Run one-time health check
npm run monitor:health
```

### Scheduled Tasks
- **Daily reports**: 2:00 AM UTC
- **Log cleanup**: Sunday 3:00 AM UTC
- **Health checks**: Every hour

## Log Analysis

### Report Structure
```json
{
  "date": "2023-10-30",
  "summary": {
    "totalRequests": 1250,
    "errorCount": 15,
    "securityEvents": 8,
    "auditEvents": 45
  },
  "errors": [...],
  "securityEvents": [...],
  "auditEvents": [...],
  "performanceMetrics": [...],
  "topEndpoints": {...},
  "userActivity": {...},
  "insights": {
    "health": "good|warning|poor",
    "alerts": [...],
    "recommendations": [...]
  }
}
```

### Health Indicators
- **Error rate > 5%**: Poor health
- **Error rate > 2%**: Warning
- **Security events > 10/day**: Warning
- **Slow operations > 1s**: Recommendation

## Security Features

### Audit Trail
All important actions are logged:
- User registration/login/logout
- Project CRUD operations
- GitHub sync activities
- Administrative actions

### Security Events
- Failed login attempts
- Account lockouts
- Invalid token usage
- Suspicious request patterns

### IP Tracking
All logs include client IP for security analysis.

## Performance Monitoring

### Database Queries
- Query execution time
- Error tracking
- Query patterns

### API Endpoints
- Request duration
- Error rates
- Popular endpoints

### System Performance
- Memory usage (if available)
- Response times
- Throughput metrics

## Development

### Adding New Log Types
```javascript
// Add to logger.js
const structuredLogger = {
  // ... existing methods
  
  custom: (event, req, data = {}) => {
    logWithRequest('info', `CUSTOM: ${event}`, req, {
      customEvent: event,
      ...data
    });
  }
};
```

### Testing
```javascript
// Mock logger for tests
jest.mock('./utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    audit: jest.fn(),
    security: jest.fn()
  }
}));
```

## Troubleshooting

### Common Issues

1. **Logs not appearing**
   - Check log level configuration
   - Verify file permissions
   - Ensure disk space available

2. **Missing request context**
   - Verify requestLogger middleware is used
   - Check middleware order

3. **Sensitive data in logs**
   - Update sensitiveFields array
   - Verify sanitizeData function

### Debug Mode
Set `DEBUG=logger` environment variable for detailed logging system debug information.

## Integration with External Systems

### Log Forwarding
The JSON format is compatible with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- Datadog
- New Relic
- Graylog

### Alerting
Configure alerts based on:
- Error rate thresholds
- Security event patterns
- Performance degradation
- System health indicators

## Best Practices

1. **Use appropriate log levels**
2. **Include relevant context**
3. **Avoid logging sensitive data**
4. **Use structured data**
5. **Log at service boundaries**
6. **Include correlation IDs**
7. **Monitor log volumes**
8. **Regular log cleanup**

## Security Considerations

1. **Log access control**: Restrict log file access
2. **Encryption**: Encrypt logs at rest in production
3. **Integrity**: Consider log signing for critical events
4. **Retention**: Follow data retention policies
5. **Privacy**: Comply with GDPR/CCPA requirements