# Docker Security Configuration

## Security Features Implemented

### Multi-stage Dockerfile
- **Builder stage**: Isolates build dependencies and reduces final image size
- **Production stage**: Minimal runtime environment with only necessary components
- **Non-root user**: Application runs as UID 1001 with limited privileges
- **Secure base image**: Uses Alpine Linux with minimal attack surface

### Security Hardening
- **no-new-privileges**: Prevents privilege escalation
- **Read-only filesystem**: Prevents unauthorized modifications
- **Capability dropping**: Removes all Linux capabilities except essential ones
- **Resource limits**: CPU and memory constraints to prevent DoS attacks
- **Tmpfs mounts**: Temporary files stored in memory, not persisted

### Health Checks
- **Application health**: HTTP endpoint monitoring every 30 seconds
- **Database health**: MySQL connectivity verification
- **Graceful degradation**: Automatic restart on failure

### Network Security
- **Isolated network**: Custom bridge network (172.20.0.0/16)
- **DNS configuration**: Uses secure DNS servers
- **Service dependencies**: Database must be healthy before app starts

### Secrets Management
- **Environment variables**: All secrets passed via environment
- **No hardcoded secrets**: Configuration externalized
- **Production-ready**: Secure defaults with required overrides

## Usage Instructions

1. **Generate secure secrets**:
   ```bash
   openssl rand -hex 32  # For JWT_SECRET
   openssl rand -base64 32  # For database passwords
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   # Edit .env with your secure values
   ```

3. **Deploy with security**:
   ```bash
   docker-compose up -d
   ```

## Security Monitoring

- **Health status**: `docker-compose ps`
- **Resource usage**: `docker stats`
- **Security scan**: `docker scan portfolio-website`
- **Log monitoring**: `docker-compose logs -f`

## Compliance Notes

This configuration follows Docker security best practices:
- CIS Docker Benchmark compliance
- OWASP Docker security guidelines
- Industry-standard container hardening