#!/bin/bash

# Start script for Docker container
set -e

echo "🚀 Starting Portfolio Website..."

# Start nginx in background
nginx -g "daemon off;" &
NGINX_PID=$!

# Start API server in background
cd /app/api
npm start &
API_PID=$!

# Wait a moment for services to start
sleep 3

# Function to handle shutdown
shutdown() {
    echo "🛑 Shutting down..."
    kill $NGINX_PID 2>/dev/null
    kill $API_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Wait for processes
wait