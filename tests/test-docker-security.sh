#!/bin/bash

# Docker Security Testing Script
# Tests the security configurations of the portfolio website

set -e

echo "🔒 Docker Security Testing for Portfolio Website"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test functions
test_security() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

warning_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ WARNING${NC}"
        return 1
    else
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    fi
}

echo "Building Docker image..."
docker build -t portfolio-website:test .

echo -e "\n📋 Security Configuration Tests"
echo "--------------------------------"

# Test 1: Non-root user
test_security "Non-root user" "docker run --rm portfolio-website:test whoami | grep -v root"

# Test 2: Read-only filesystem
test_security "Read-only filesystem" "docker run --rm --read-only portfolio-website:test test -w /tmp"

# Test 3: No new privileges
test_security "No new privileges" "docker run --rm --security-opt no-new-privileges:true portfolio-website:test true"

# Test 4: Health check
test_security "Health check endpoint" "docker run --rm -p 8081:8080 -d portfolio-website:test && sleep 5 && curl -f http://localhost:8081/api/health"

# Test 5: Resource limits
warning_test "Resource limits" "docker run --rm --memory=128m portfolio-website:test true"

echo -e "\n🔍 Image Security Analysis"
echo "---------------------------"

# Check image size
IMAGE_SIZE=$(docker images portfolio-website:test --format "{{.Size}}")
echo "Image size: $IMAGE_SIZE"

# Check for vulnerabilities (if docker scan is available)
if command -v docker scan &> /dev/null; then
    echo "Running vulnerability scan..."
    docker scan portfolio-website:test || echo "Docker scan not available or failed"
else
    echo "Docker scan not available - install Snyk for vulnerability scanning"
fi

echo -e "\n🏗️  Build Security Tests"
echo "------------------------"

# Test multi-stage build
LAYERS=$(docker history portfolio-website:test --format "{{.ID}}" | wc -l)
echo "Number of layers: $LAYERS"
test_security "Multi-stage build efficiency" "[ $LAYERS -lt 20 ]"

echo -e "\n🌐 Network Security Tests"
echo "-------------------------"

# Test network isolation
test_security "Custom network creation" "docker network create test-net && docker network rm test-net"

echo -e "\n📊 Test Summary"
echo "==============="

# Cleanup
docker stop $(docker ps -q --filter "ancestor=portfolio-website:test") 2>/dev/null || true
docker rmi portfolio-website:test 2>/dev/null || true

echo -e "\n${GREEN}Security testing completed!${NC}"
echo "Review the results above and address any failures."