# Multi-stage build for security and optimization
FROM node:18-alpine AS builder

# Install build dependencies in a single layer for optimization
RUN apk add --no-cache python3 make g++ && \
    addgroup -g 1001 -S appgroup && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appgroup appuser

WORKDIR /app

# Copy API package files and install dependencies in single layer
COPY src/api/package*.json ./api/
RUN cd api && \
    npm ci --only=production && \
    npm cache clean --force && \
    chown -R appuser:appgroup /app

# Copy API source files
COPY src/api/ ./api/

# Production stage with optimized layering
FROM node:18-alpine AS production

# Install runtime dependencies and security tools in single layer
RUN apk add --no-cache \
    nginx \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/* \
    && addgroup -g 1001 -S appgroup \
    && adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appgroup appuser \
    && mkdir -p /var/lib/nginx/tmp /var/lib/nginx/logs /run/nginx /tmp \
    && chown -R appuser:appgroup /var/lib/nginx /run/nginx /tmp

WORKDIR /app

# Copy built API from builder stage with proper ownership
COPY --from=builder --chown=appuser:appgroup /app/api ./api

# Copy frontend files with optimized permissions
COPY --chown=appuser:appgroup public/ /var/www/html/
COPY --chown=appuser:appgroup nginx.conf /etc/nginx/nginx.conf

# Create secure startup script with proper permissions
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "Starting secure portfolio application..."' >> /start.sh && \
    echo 'mkdir -p /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy /var/lib/nginx/tmp/fastcgi /var/lib/nginx/tmp/uwsgi /var/lib/nginx/tmp/scgi' >> /start.sh && \
    echo 'mkdir -p /var/lib/nginx/logs /tmp && chown -R appuser:appgroup /var/lib/nginx/logs /tmp' >> /start.sh && \
    echo 'touch /var/lib/nginx/logs/error.log /var/lib/nginx/logs/access.log && chown appuser:appgroup /var/lib/nginx/logs/*.log' >> /start.sh && \
    echo 'nginx -g "daemon off;" &' >> /start.sh && \
    echo 'cd /app/api && exec dumb-init npm start' >> /start.sh && \
    chmod 755 /start.sh && \
    chown appuser:appgroup /start.sh

# Create Node.js based health check script with optimized permissions
RUN echo '#!/usr/bin/env node' > /healthcheck.js && \
    echo 'const http = require("http");' >> /healthcheck.js && \
    echo 'const options = {' >> /healthcheck.js && \
    echo '  hostname: "localhost",' >> /healthcheck.js && \
    echo '  port: 8081,' >> /healthcheck.js && \
    echo '  path: "/api/health",' >> /healthcheck.js && \
    echo '  method: "GET",' >> /healthcheck.js && \
    echo '  timeout: 5000,' >> /healthcheck.js && \
    echo '  headers: {"User-Agent": "Docker-Health-Check"}' >> /healthcheck.js && \
    echo '};' >> /healthcheck.js && \
    echo 'const req = http.request(options, (res) => {' >> /healthcheck.js && \
    echo '  if (res.statusCode === 200) {' >> /healthcheck.js && \
    echo '    process.exit(0);' >> /healthcheck.js && \
    echo '  } else {' >> /healthcheck.js && \
    echo '    process.exit(1);' >> /healthcheck.js && \
    echo '  }' >> /healthcheck.js && \
    echo '});' >> /healthcheck.js && \
    echo 'req.on("error", () => process.exit(1));' >> /healthcheck.js && \
    echo 'req.on("timeout", () => {' >> /healthcheck.js && \
    echo '  req.destroy();' >> /healthcheck.js && \
    echo '  process.exit(1);' >> /healthcheck.js && \
    echo '});' >> /healthcheck.js && \
    echo 'req.end();' >> /healthcheck.js && \
    echo 'setTimeout(() => process.exit(1), 10000);' >> /healthcheck.js && \
    chmod 755 /healthcheck.js && \
    chown appuser:appgroup /healthcheck.js

# Set optimized permissions in single layer - directories 755, files 644, executables 755
RUN chown -R appuser:appgroup /app /var/www/html && \
    find /var/www/html -type d -exec chmod 755 {} \; && \
    find /var/www/html -type f -name "*.js" -exec chmod 755 {} \; && \
    find /var/www/html -type f ! -name "*.js" -exec chmod 644 {} \; && \
    chmod 644 /etc/nginx/nginx.conf

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node /healthcheck.js

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["/start.sh"]