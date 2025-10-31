#!/bin/bash

# Production Setup Script for Portfolio Website
# This script generates secure secrets and prepares the environment for production

set -e  # Exit on any error

echo "🚀 Portfolio Website Production Setup"
echo "====================================="
echo

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📁 Current directory: $(pwd)"
echo

# Generate secure secrets
echo "🔐 Generating secure production secrets..."
node scripts/generate-secrets.js

echo
echo "📋 Next steps:"
echo "1. Review and update the following in .env.production:"
echo "   - GITHUB_TOKEN (set to your actual GitHub personal access token)"
echo "   - SMTP_USER (set to your actual email address)"
echo "   - SMTP_PASS (set to your actual app password)"
echo
echo "2. Ensure .env.production is added to .gitignore"
echo "3. Set proper file permissions: chmod 600 .env.production"
echo "4. Deploy using your preferred method (Docker, PM2, etc.)"
echo
echo "✅ Production setup complete!"
echo "🔒 Remember to keep your secrets secure and never commit them to version control!"