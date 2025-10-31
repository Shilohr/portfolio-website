FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY src/api/package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/api/ ./
COPY public/ /var/www/html/

# Install nginx for static files
RUN apk add --no-cache nginx

# Create simple startup script
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'cd /app && npm start' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]