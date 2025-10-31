# Secure Docker Deployment Guide

## Overview
This guide covers the secure deployment of the portfolio website using Docker with comprehensive security hardening.

## Prerequisites
- Docker 20.10+ with Docker Compose
- OpenSSL for generating secure secrets
- Production environment variables

## Security Features Implemented

### 1. Multi-stage Dockerfile
- **Builder stage**: Isolates build dependencies
- **Production stage**: Minimal runtime environment
- **Non-root user**: UID 1001 with limited privileges
- **Secure base**: Alpine Linux minimal attack surface

### 2. Container Security
- **no-new-privileges**: Prevents privilege escalation
- **Read-only filesystem**: Prevents unauthorized modifications
- **Capability dropping**: Removes all non-essential capabilities
- **Resource limits**: CPU and memory constraints
- **Tmpfs mounts**: Temporary files in memory only

### 3. Network Security
- **Isolated network**: Custom bridge network (172.20.0.0/16)
- **Service dependencies**: Health checks before startup
- **DNS security**: Uses secure DNS servers

### 4. Health Monitoring
- **Application health**: `/api/health` endpoint monitoring
- **Database health**: MySQL connectivity verification
- **Automatic recovery**: Restart on failure

## Deployment Steps

### 1. Generate Secure Secrets
```bash
# Generate JWT secret (64 characters)
JWT_SECRET=$(openssl rand -hex 32)

# Generate database passwords (32 characters)
DB_PASSWORD=$(openssl rand -base64 32)
DB_ROOT_PASSWORD=$(openssl rand -base64 32)

echo "JWT_SECRET=$JWT_SECRET"
echo "DB_PASSWORD=$DB_PASSWORD" 
echo "DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD"
```

### 2. Configure Environment
```bash
# Copy and configure environment
cp .env.example .env

# Edit .env with your secure values
nano .env
```

### 3. Security Testing
```bash
# Run security tests before deployment
./test-docker-security.sh
```

### 4. Deploy Application
```bash
# Build and start with security configurations
docker-compose up -d

# Verify deployment
docker-compose ps
docker-compose logs -f
```

## Security Monitoring

### Health Checks
```bash
# Check service health
docker-compose ps

# Detailed health status
curl http://localhost:8080/api/health
```

### Resource Monitoring
```bash
# Monitor resource usage
docker stats

# Check logs for security events
docker-compose logs portfolio | grep -i "security\|auth\|error"
```

### Security Scanning
```bash
# Vulnerability scanning (requires Snyk)
docker scan portfolio-website

# Image analysis
docker history portfolio-website_portfolio
```

## Security Best Practices

### 1. Secrets Management
- Never commit secrets to version control
- Use environment variables for all sensitive data
- Rotate secrets regularly
- Use different secrets for each environment

### 2. Network Security
- Keep containers in isolated networks
- Use firewall rules to restrict access
- Monitor network traffic for anomalies
- Implement rate limiting

### 3. Runtime Security
- Monitor container resource usage
- Set up alerting for security events
- Regular security updates and patches
- Log aggregation and analysis

### 4. Compliance
- CIS Docker Benchmark compliance
- OWASP security guidelines
- Regular security audits
- Incident response procedures

## Troubleshooting

### Common Issues

#### Permission Denied
```bash
# Check user permissions
docker run --rm portfolio-website:test whoami

# Verify file ownership
docker run --rm portfolio-website:test ls -la /app
```

#### Health Check Failures
```bash
# Test health endpoint manually
curl -v http://localhost:8080/api/health

# Check container logs
docker-compose logs portfolio
```

#### Resource Limits
```bash
# Monitor resource usage
docker stats --no-stream

# Adjust limits in docker-compose.yml
```

## Security Checklist

### Pre-Deployment
- [ ] All secrets generated and configured
- [ ] Security tests passing
- [ ] Image vulnerability scan clean
- [ ] Resource limits configured
- [ ] Health checks working

### Post-Deployment
- [ ] Services running as non-root
- [ ] Filesystem read-only (except tmpfs)
- [ ] Network isolation verified
- [ ] Monitoring configured
- [ ] Backup procedures in place

### Ongoing Maintenance
- [ ] Regular security updates
- [ ] Secret rotation schedule
- [ ] Log monitoring active
- [ ] Performance metrics tracked
- [ ] Security audit schedule

## Emergency Procedures

### Security Incident Response
1. Immediately isolate affected containers
2. Preserve logs and evidence
3. Rotate all compromised secrets
4. Update and redeploy with latest security patches
5. Conduct post-incident analysis

### Container Compromise
```bash
# Stop compromised container
docker-compose stop portfolio

# Preserve logs
docker logs portfolio > incident-logs.txt

# Redeploy with new secrets
# (Follow deployment steps with new secrets)
```

## Support and Resources

- Docker Security Best Practices: https://docs.docker.com/engine/security/
- CIS Docker Benchmark: https://www.cisecurity.org/benchmark/docker
- OWASP Docker Security: https://owasp.org/www-project-docker-top-10/
- Security Scanning: https://snyk.io/product/container-vulnerability-management/