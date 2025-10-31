#!/bin/bash

# Portfolio Website Deployment Script
set -e

echo "🚀 Deploying Portfolio Website..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before running again."
    exit 1
fi

# Build and start containers
echo "🐳 Building and starting Docker containers..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Check if containers are running
echo "🔍 Checking container status..."
docker-compose ps

# Run database migrations/seeds
echo "🗄️ Running database setup..."
docker-compose exec db mysql -u root -p"$DB_ROOT_PASSWORD" portfolio < database/schema.sql
docker-compose exec db mysql -u root -p"$DB_ROOT_PASSWORD" portfolio < database/seeds.sql

# Test API health
echo "🏥 Testing API health..."
sleep 5
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ API is healthy!"
else
    echo "❌ API health check failed"
    docker-compose logs portfolio
    exit 1
fi

echo "🎉 Deployment completed successfully!"
echo "🌐 Website is available at: http://localhost:8080"
echo "🔧 API is available at: http://localhost:8080/api"