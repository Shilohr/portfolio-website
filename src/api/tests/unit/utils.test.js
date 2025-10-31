const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Utility Functions', () => {
  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 12);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should compare password correctly', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare(password, hash);
      const isInvalid = await bcrypt.compare('wrongPassword', hash);
      
      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it('should handle different salt rounds', async () => {
      const password = 'testPassword123';
      const hash10 = await bcrypt.hash(password, 10);
      const hash12 = await bcrypt.hash(password, 12);
      
      expect(hash10).not.toBe(hash12);
      
      const isValid10 = await bcrypt.compare(password, hash10);
      const isValid12 = await bcrypt.compare(password, hash12);
      
      expect(isValid10).toBe(true);
      expect(isValid12).toBe(true);
    });
  });

  describe('JWT Token Operations', () => {
    const secret = 'test-secret-key';
    const payload = {
      userId: 1,
      username: 'testuser',
      role: 'developer'
    };

    it('should generate valid JWT token', () => {
      const token = jwt.sign(payload, secret, { expiresIn: '1h' });
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify JWT token correctly', () => {
      const token = jwt.sign(payload, secret, { expiresIn: '1h' });
      const decoded = jwt.verify(token, secret);
      
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should fail verification with wrong secret', () => {
      const token = jwt.sign(payload, secret, { expiresIn: '1h' });
      
      expect(() => {
        jwt.verify(token, 'wrong-secret');
      }).toThrow();
    });

    it('should fail verification with expired token', () => {
      const token = jwt.sign(payload, secret, { expiresIn: '0s' });
      
      // Wait a bit to ensure expiration
      setTimeout(() => {
        expect(() => {
          jwt.verify(token, secret);
        }).toThrow();
      }, 10);
    });

    it('should handle token with additional claims', () => {
      const extendedPayload = {
        ...payload,
        permissions: ['read', 'write'],
        department: 'engineering'
      };
      
      const token = jwt.sign(extendedPayload, secret, { expiresIn: '1h' });
      const decoded = jwt.verify(token, secret);
      
      expect(decoded.permissions).toEqual(['read', 'write']);
      expect(decoded.department).toBe('engineering');
    });
  });

  describe('Input Validation Utilities', () => {
    it('should validate email format correctly', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com'
      ];
      
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test.example.com',
        'test@.com',
        'test@example.'
      ];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });
      
      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    it('should validate password strength', () => {
      const strongPasswords = [
        'Password123',
        'MySecurePass456',
        'ComplexP@ssw0rd'
      ];
      
      const weakPasswords = [
        'password',
        '123456',
        'Password',
        '12345678',
        'pass'
      ];

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      
      strongPasswords.forEach(password => {
        expect(passwordRegex.test(password)).toBe(true);
      });
      
      weakPasswords.forEach(password => {
        expect(passwordRegex.test(password)).toBe(false);
      });
    });

    it('should validate username format', () => {
      const validUsernames = [
        'testuser',
        'user123',
        'test_user',
        'User123'
      ];
      
      const invalidUsernames = [
        'ab', // Too short
        'user@name', // Contains special char
        'user name', // Contains space
        'a'.repeat(51) // Too long
      ];

      const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
      
      validUsernames.forEach(username => {
        expect(usernameRegex.test(username)).toBe(true);
      });
      
      invalidUsernames.forEach(username => {
        expect(usernameRegex.test(username)).toBe(false);
      });
    });
  });

  describe('Date and Time Utilities', () => {
    it('should format dates correctly', () => {
      const testDate = new Date('2023-12-25T10:30:00Z');
      
      // Test ISO string format
      const isoString = testDate.toISOString();
      expect(isoString).toBe('2023-12-25T10:30:00.000Z');
      
      // Test date components
      expect(testDate.getFullYear()).toBe(2023);
      expect(testDate.getMonth()).toBe(11); // 0-indexed
      expect(testDate.getDate()).toBe(25);
    });

    it('should calculate time differences correctly', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day later
      
      const diffPast = now - past;
      const diffFuture = future - now;
      
      expect(diffPast).toBe(24 * 60 * 60 * 1000);
      expect(diffFuture).toBe(24 * 60 * 60 * 1000);
    });

    it('should handle timestamp conversions', () => {
      const timestamp = Date.now();
      const date = new Date(timestamp);
      
      expect(date.getTime()).toBe(timestamp);
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('String Manipulation Utilities', () => {
    it('should sanitize strings correctly', () => {
      const dirtyString = '  <script>alert("xss")</script>  ';
      const cleanString = dirtyString.trim().replace(/<[^>]*>/g, '');
      
      expect(cleanString).toBe('alert("xss")');
      expect(cleanString).not.toContain('<script>');
      expect(cleanString).not.toContain('</script>');
    });

    it('should truncate long strings', () => {
      const longString = 'This is a very long string that needs to be truncated';
      const truncated = longString.substring(0, 20) + '...';
      
      expect(truncated.length).toBeLessThanOrEqual(23);
      expect(truncated).toBe('This is a very long...');
    });

    it('should handle URL validation', () => {
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://github.com/user/repo',
        'https://www.example.com/path?query=value'
      ];
      
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        'http://',
        'https://',
        'example.com'
      ];

      try {
        validUrls.forEach(url => new URL(url));
        // If no error thrown, URL is valid
      } catch (e) {
        fail(`Valid URL failed: ${url}`);
      }

      invalidUrls.forEach(url => {
        expect(() => new URL(url)).toThrow();
      });
    });
  });

  describe('Error Handling Utilities', () => {
    it('should create error objects correctly', () => {
      const error = new Error('Test error message');
      const customError = new Error('Custom error');
      customError.status = 400;
      customError.code = 'VALIDATION_ERROR';
      
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('Error');
      expect(customError.status).toBe(400);
      expect(customError.code).toBe('VALIDATION_ERROR');
    });

    it('should handle async errors properly', async () => {
      const asyncFunction = async () => {
        throw new Error('Async error');
      };
      
      await expect(asyncFunction()).rejects.toThrow('Async error');
    });
  });
});