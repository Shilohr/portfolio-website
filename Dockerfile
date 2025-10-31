FROM node:18-alpine

# Install nginx
RUN apk add --no-cache nginx

WORKDIR /app

# Copy API files
COPY src/api/ ./api/
COPY src/api/package*.json ./api/
RUN cd api && npm ci --only=production

# Copy frontend files
COPY public/ /var/www/html/
COPY nginx.conf /etc/nginx/nginx.conf

# Create a simple startup script
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'nginx -g "daemon off;" &' >> /start.sh && \
    echo 'cd /app/api && npm start &' >> /start.sh && \
    echo 'wait' >> /start.sh && \
    chmod +x /start.sh

# Expose port
EXPOSE 8080

CMD ["/start.sh"]