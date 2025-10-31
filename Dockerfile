FROM node:18-alpine

WORKDIR /app

# Install nginx and copy frontend files
RUN apk add --no-cache nginx

# Copy API package files and install dependencies
COPY src/api/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy API source code
COPY src/api/ ./

# Copy frontend files
COPY src/frontend/ /var/www/html/
COPY config/nginx.conf /etc/nginx/nginx.conf

# Create startup script that runs both nginx and the API
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "Starting nginx..."' >> /start.sh && \
    echo 'nginx -g "daemon off;" &' >> /start.sh && \
    echo 'echo "Starting API server..."' >> /start.sh && \
    echo 'cd /app && node server.js' >> /start.sh && \
    echo 'wait' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
