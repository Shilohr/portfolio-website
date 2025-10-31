const { validateConfig, generateSecureSecrets, validateVariable, envSchema } = require('../utils/config');
const TestHelpers = require('./helpers');

describe('Configuration Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear specific env vars that might interfere
    delete process.env.DB_HOST;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.JWT_SECRET;
    delete process.env.GITHUB_TOKEN;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
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
      expect(configStatus.environment).toBe('development');
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

    it('should validate email format', () => {
      process.env.SMTP_USER = 'invalid-email';
      
      expect(() => validateConfig()).toThrow(/SMTP_USER must be a valid email/);
    });

    it('should validate CORS origin URL', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      process.env.CORS_ORIGIN = 'not-a-url';
      
      expect(() => validateConfig()).toThrow(/CORS_ORIGIN must be a valid uri/);
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

    it('should detect common weak patterns', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.DB_PASSWORD = 'password123';
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      expect(() => validateConfig()).toThrow(/DB_PASSWORD appears to be using a weak or default value/);
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

    it('should detect insufficient entropy in secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32); // Too short for production
      process.env.DB_PASSWORD = 'b'.repeat(32);
      process.env.DB_ROOT_PASSWORD = 'c'.repeat(32);
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'd'.repeat(16);
      
      expect(() => validateConfig()).toThrow(/JWT_SECRET must be at least 64 characters in production/);
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

    it('should not expose sensitive information in status', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'super-secret-key';
      process.env.DB_PASSWORD = 'database-password';
      process.env.DB_ROOT_PASSWORD = 'root-password';
      process.env.SMTP_USER = 'test@example.com';
      process.env.SMTP_PASS = 'email-password';
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.security).not.toHaveProperty('jwtSecret');
      expect(configStatus.database).not.toHaveProperty('password');
      expect(configStatus.database).not.toHaveProperty('rootPassword');
      expect(configStatus.features.email).not.toHaveProperty('password');
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

    it('should allow custom rate limit configuration', () => {
      process.env.NODE_ENV = 'development';
      process.env.RATE_LIMIT_MAX_REQUESTS = '100';
      process.env.AUTH_RATE_LIMIT_MAX = '10';
      
      const { configStatus } = validateConfig();
      
      expect(configStatus.security.rateLimiting.maxRequests).toBe(100);
      expect(configStatus.security.rateLimiting.authMaxRequests).toBe(10);
    });
  });

  describe('Edge Cases', () => {
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

    it('should handle null and undefined values', () => {
      process.env.JWT_SECRET = null;
      process.env.DB_PASSWORD = undefined;
      
      // Should use defaults
      const { envVars } = validateConfig();
      
      expect(envVars.JWT_SECRET).toBeDefined();
      expect(envVars.DB_PASSWORD).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages', () => {
      process.env.NODE_ENV = 'invalid';
      
      try {
        validateConfig();
      } catch (error) {
        expect(error.message).toContain('NODE_ENV');
        expect(error.message).toContain('must be one of');
      }
    });

    it('should handle multiple validation errors', () => {
      process.env.NODE_ENV = 'invalid';
      process.env.PORT = '99999';
      process.env.LOG_LEVEL = 'invalid';
      
      try {
        validateConfig();
      } catch (error) {
        expect(error.message).toContain('NODE_ENV');
        expect(error.message).toContain('PORT');
        expect(error.message).toContain('LOG_LEVEL');
      }
    });

    it('should handle circular references in environment', () => {
      const circular = {};
      circular.self = circular;
      process.env.CIRCULAR = circular;
      
      // Should not throw
      expect(() => validateConfig()).not.toThrow();
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
  });

  it('should generate different secrets each time', () => {
    const secrets1 = generateSecureSecrets();
    const secrets2 = generateSecureSecrets();
    
    expect(secrets1.JWT_SECRET).not.toBe(secrets2.JWT_SECRET);
    expect(secrets1.DB_PASSWORD).not.toBe(secrets2.DB_PASSWORD);
    expect(secrets1.DB_ROOT_PASSWORD).not.toBe(secrets2.DB_ROOT_PASSWORD);
    expect(secrets1.SMTP_PASS).not.toBe(secrets2.SMTP_PASS);
  });

  it('should generate hex-encoded secrets', () => {
    const secrets = generateSecureSecrets();
    
    const hexRegex = /^[0-9a-f]+$/;
    expect(hexRegex.test(secrets.JWT_SECRET)).toBe(true);
    expect(hexRegex.test(secrets.DB_PASSWORD)).toBe(true);
    expect(hexRegex.test(secrets.DB_ROOT_PASSWORD)).toBe(true);
    expect(hexRegex.test(secrets.SMTP_PASS)).toBe(true);
  });

  it('should generate secrets with sufficient entropy', () => {
    const secrets = generateSecureSecrets();
    
    // Check for character variety
    const hasNumbers = /\d/.test(secrets.JWT_SECRET);
    const hasLetters = /[a-f]/.test(secrets.JWT_SECRET);
    
    expect(hasNumbers).toBe(true);
    expect(hasLetters).toBe(true);
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

  it('should validate GitHub token pattern', () => {
    const validResult = validateVariable('GITHUB_TOKEN', 'ghp_' + 'a'.repeat(36), true);
    expect(validResult.valid).toBe(true);
    
    const invalidResult = validateVariable('GITHUB_TOKEN', 'invalid-token', true);
    expect(invalidResult.valid).toBe(false);
  });

  it('should validate port range', () => {
    const validResult = validateVariable('PORT', '3000');
    expect(validResult.valid).toBe(true);
    
    const invalidResult = validateVariable('PORT', '99999');
    expect(invalidResult.valid).toBe(false);
  });

  it('should validate URL format', () => {
    const validResult = validateVariable('CORS_ORIGIN', 'https://example.com', true);
    expect(validResult.valid).toBe(true);
    
    const invalidResult = validateVariable('CORS_ORIGIN', 'not-a-url', true);
    expect(invalidResult.valid).toBe(false);
  });
});

describe('Schema Validation', () => {
  it('should have all required environment variables defined', () => {
    const schemaKeys = Object.keys(envSchema.describe().keys);
    
    const requiredKeys = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_ROOT_PASSWORD',
      'JWT_SECRET', 'NODE_ENV', 'PORT', 'GITHUB_USERNAME', 'GITHUB_TOKEN',
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'CORS_ORIGIN',
      'LOG_LEVEL', 'LOG_FILE_ENABLED', 'RATE_LIMIT_WINDOW_MS',
      'RATE_LIMIT_MAX_REQUESTS', 'AUTH_RATE_LIMIT_MAX'
    ];
    
    requiredKeys.forEach(key => {
      expect(schemaKeys).toContain(key);
    });
  });

  it('should provide appropriate defaults for development', () => {
    const schema = envSchema.describe();
    
    expect(schema.keys.DB_HOST.defaults).toEqual(['localhost']);
    expect(schema.keys.DB_USER.defaults).toEqual(['portfolio']);
    expect(schema.keys.NODE_ENV.defaults).toEqual(['development']);
    expect(schema.keys.PORT.defaults).toEqual([3000]);
  });

  it('should require certain fields in production', () => {
    const schema = envSchema.describe();
    
    // JWT_SECRET should be required in production
    expect(schema.keys.JWT_ENV.flags?.presence).toBe('required');
  });
});