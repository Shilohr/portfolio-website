const { validateConfig, generateSecureSecrets, validateVariable, envSchema } = require('../../utils/config');

describe('Configuration Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear specific env vars that might interfere
    delete process.env.DB_HOST;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Environment Schema Validation', () => {
    it('should validate development environment with defaults', () => {
      process.env.NODE_ENV = 'development';
      
      const { envVars, configStatus } = validateConfig();
      
      expect(envVars.NODE_ENV).toBe('development');
      expect(envVars.PORT).toBe(3000);
      expect(envVars.DB_HOST).toBe('localhost');
      expect(envVars.DB_USER).toBe('portfolio');
      expect(envVars.DB_NAME).toBe('portfolio');
      expect(envVars.JWT_SECRET).toBeDefined();
      expect(envVars.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
    });

    it('should validate test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const { envVars, configStatus } = validateConfig();
      
      expect(envVars.NODE_ENV).toBe('test');
      expect(configStatus.environment).toBe('test');
    });

    it('should require strong secrets in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'weak-secret';
      process.env.DB_PASSWORD = 'short';
      process.env.DB_ROOT_PASSWORD = 'also-short';
      
      expect(() => validateConfig()).toThrow(/JWT_SECRET must be at least 64 characters in production/);
    });

    it('should accept strong secrets in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      const { envVars, configStatus } = validateConfig();
      
      expect(envVars.JWT_SECRET).toBe('a'.repeat(64));
      expect(envVars.DB_PASSWORD).toBe('b'.repeat(32));
      expect(configStatus.security.hasJwtSecret).toBe(true);
      expect(configStatus.security.jwtSecretLength).toBe(64);
    });

    it('should validate GitHub token format in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      process.env.GITHUB_TOKEN = 'invalid-token-format';
      
      expect(() => validateConfig()).toThrow(/GITHUB_TOKEN must be a valid GitHub personal access token/);
    });

    it('should accept valid GitHub token format', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      process.env.GITHUB_TOKEN = 'ghp_' + 'a'.repeat(36);
      
      const { envVars } = validateConfig();
      
      expect(envVars.GITHUB_TOKEN).toBe('ghp_' + 'a'.repeat(36));
    });

    it('should validate port range', () => {
      process.env.PORT = '99999';
      
      expect(() => validateConfig()).toThrow(/PORT must be less than or equal to 65535/);
    });

    it('should validate log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      
      expect(() => validateConfig()).toThrow(/LOG_LEVEL must be one of \[error, warn, info, debug\]/);
    });

    it('should validate NODE_ENV values', () => {
      process.env.NODE_ENV = 'staging';
      
      expect(() => validateConfig()).toThrow(/NODE_ENV must be one of \[development, production, test\]/);
    });
  });

  describe('Security Checks', () => {
    it('should detect weak password patterns', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'securepassword';
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      expect(() => validateConfig()).toThrow(/DB_PASSWORD appears to be using a weak or default value/);
    });

    it('should detect weak JWT secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'your-secret-key';
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      expect(() => validateConfig()).toThrow(/JWT_SECRET appears to be using a weak or default value/);
    });

    it('should warn about default GitHub token in production', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      process.env.GITHUB_TOKEN = 'your-github-personal-access-token';
      
      validateConfig();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_TOKEN appears to be using a default value')
      );
      
      consoleSpy.mockRestore();
    });

    it('should warn about default email configuration in production', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'your-email@gmail.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      validateConfig();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SMTP_USER appears to be using a default value')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Status', () => {
    it('should return proper configuration status', () => {
      process.env.NODE_ENV = 'development';
      process.env.GITHUB_USERNAME = 'testuser';
      process.env.GITHUB_TOKEN = 'ghp_' + 'a'.repeat(36);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'secure-password';
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.environment).toBe('development');
      expect(configStatus.port).toBe(3000);
      expect(configStatus.database.host).toBe('localhost');
      expect(configStatus.database.hasPassword).toBe(true);
      expect(configStatus.security.hasJwtSecret).toBe(true);
      expect(configStatus.features.github.username).toBe('testuser');
      expect(configStatus.features.github.hasToken).toBe(true);
      expect(configStatus.features.email.hasUser).toBe(true);
      expect(configStatus.features.email.hasPassword).toBe(true);
      expect(configStatus.logging.level).toBe('info');
      expect(configStatus.logging.fileEnabled).toBe(true);
    });

    it('should handle missing optional features', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.GITHUB_TOKEN;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.features.github.hasToken).toBe(false);
      expect(configStatus.features.email.hasUser).toBe(false);
      expect(configStatus.features.email.hasPassword).toBe(false);
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should set appropriate rate limits for production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.security.rateLimiting.maxRequests).toBe(50);
      expect(configStatus.security.rateLimiting.authMaxRequests).toBe(5);
    });

    it('should set lenient rate limits for development', () => {
      process.env.NODE_ENV = 'development';
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.security.rateLimiting.maxRequests).toBe(200);
      expect(configStatus.security.rateLimiting.authMaxRequests).toBe(20);
    });
  });
});

describe('Secure Secrets Generation', () => {
  it('should generate cryptographically secure secrets', () => {
    const secrets = generateSecureSecrets();
    
    expect(secrets.JWT_SECRET).toBeDefined();
    expect(secrets.DB_PASSWORD).toBeDefined();
    expect(secrets.DB_ROOT_PASSWORD).toBeDefined();
    expect(secrets.SMTP_PASS).toBeDefined();
    
    expect(secrets.JWT_SECRET.length).toBe(64);
    expect(secrets.DB_PASSWORD.length).toBe(64);
    expect(secrets.DB_ROOT_PASSWORD.length).toBe(64);
    expect(secrets.SMTP_PASS.length).toBe(32);
    
    // Ensure secrets are different each time
    const secrets2 = generateSecureSecrets();
    expect(secrets.JWT_SECRET).not.toBe(secrets2.JWT_SECRET);
    expect(secrets.DB_PASSWORD).not.toBe(secrets2.DB_PASSWORD);
  });

  it('should generate hex-encoded secrets', () => {
    const secrets = generateSecureSecrets();
    
    const hexRegex = /^[0-9a-f]+$/;
    expect(hexRegex.test(secrets.JWT_SECRET)).toBe(true);
    expect(hexRegex.test(secrets.DB_PASSWORD)).toBe(true);
    expect(hexRegex.test(secrets.DB_ROOT_PASSWORD)).toBe(true);
    expect(hexRegex.test(secrets.SMTP_PASS)).toBe(true);
  });
});

describe('Individual Variable Validation', () => {
  it('should validate valid variables', () => {
    const result = validateVariable('NODE_ENV', 'development');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('should reject invalid variables', () => {
    const result = validateVariable('NODE_ENV', 'invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be one of');
  });

  it('should validate email format', () => {
    const validResult = validateVariable('SMTP_USER', 'test@example.com');
    expect(validResult.valid).toBe(true);
    
    const invalidResult = validateVariable('SMTP_USER', 'invalid-email');
    expect(invalidResult.valid).toBe(false);
  });

  it('should check for weak values in production', () => {
    const result = validateVariable('DB_PASSWORD', 'password', true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weak or default value');
  });

  it('should allow strong values in production', () => {
    const result = validateVariable('DB_PASSWORD', 'a'.repeat(32), true);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('should handle non-existent variables', () => {
    const result = validateVariable('NON_EXISTENT_VAR', 'some-value');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe('Schema Edge Cases', () => {
  it('should handle empty environment gracefully', () => {
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.DB_HOST;
    
    const { envVars } = validateConfig();
    
    expect(envVars.NODE_ENV).toBe('development');
    expect(envVars.PORT).toBe(3000);
    expect(envVars.DB_HOST).toBe('localhost');
  });

  it('should allow unknown environment variables', () => {
    process.env.CUSTOM_VAR = 'custom-value';
    process.env.ANOTHER_CUSTOM = 'another-value';
    
    expect(() => validateConfig()).not.toThrow();
  });

  it('should convert string numbers to numbers', () => {
    process.env.PORT = '8080';
    process.env.RATE_LIMIT_MAX_REQUESTS = '100';
    
    const { envVars } = validateConfig();
    
    expect(typeof envVars.PORT).toBe('number');
    expect(envVars.PORT).toBe(8080);
    expect(typeof envVars.RATE_LIMIT_MAX_REQUESTS).toBe('number');
    expect(envVars.RATE_LIMIT_MAX_REQUESTS).toBe(100);
  });

  it('should handle boolean conversion', () => {
    process.env.LOG_FILE_ENABLED = 'false';
    
    const { envVars } = validateConfig();
    
    expect(typeof envVars.LOG_FILE_ENABLED).toBe('boolean');
    expect(envVars.LOG_FILE_ENABLED).toBe(false);
  });
});