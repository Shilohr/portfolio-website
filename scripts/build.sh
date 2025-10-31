#!/bin/bash

# Portfolio Website Build Script
set -e

echo "🚀 Building Portfolio Website..."

# Create necessary directories
mkdir -p public/assets/{images,icons,fonts}
mkdir -p src/api

# Copy space images to public assets
echo "📸 Copying space images..."
cp /home/shilohr/images/*.jpg public/assets/images/ 2>/dev/null || echo "No images found to copy"

# Install API dependencies
echo "📦 Installing API dependencies..."
cd src/api
npm install
cd ../..

# Build frontend assets (if any build process needed)
echo "🎨 Building frontend assets..."
# Add any frontend build commands here

# Set permissions
echo "🔒 Setting permissions..."
chmod -R 755 public/
chmod +x scripts/*.sh

echo "✅ Build completed successfully!"