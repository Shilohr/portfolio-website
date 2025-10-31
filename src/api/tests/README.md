# Comprehensive Test Suite for Portfolio API

This directory contains a comprehensive test suite for the portfolio website API, covering authentication, projects management, GitHub integration, and configuration validation.

## Test Structure

### Test Files

- **`auth.test.js`** - Authentication endpoints and security tests
- **`projects.test.js`** - Projects CRUD operations and validation tests  
- **`github.test.js`** - GitHub integration and API synchronization tests
- **`config.test.js`** - Configuration validation and security tests
- **`helpers.js`** - Test utilities and helper functions
- **`setup.js`** - Test environment setup and database mocking

### Test Categories

#### 1. Unit Tests
- Utility function validation
- Data processing logic
- Input validation
- Security checks

#### 2. Integration Tests
- API endpoint testing
- Database operations
- External service integration
- Authentication flows

#### 3. Security Tests
- SQL injection prevention
- XSS protection
- Authentication bypass attempts
- Input sanitization
- Rate limiting
- Authorization checks

#### 4. Performance Tests
- Database query performance
- Concurrent request handling
- Large dataset processing
- Response time validation

#### 5. Error Handling Tests
- Database connection failures
- Network timeouts
- Invalid input handling
- Malformed requests
- Service unavailability

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only security tests
npm run test:security

# Run only performance tests
npm run test:performance
```

### Specific Test Files

```bash
# Run authentication tests
npm run test:auth

# Run projects tests
npm run test:projects

# Run GitHub tests
npm run test:github

# Run configuration tests
npm run test:config
```

### CI/CD Testing

```bash
# Run tests for CI/CD pipeline
npm run test:ci

# Run tests silently
npm run test:silent

# Debug tests
npm run test:debug
```

## Test Coverage

The test suite aims for **80% minimum coverage** across all metrics:

- **Statements**: Code execution coverage
- **Branches**: Conditional logic coverage
- **Functions**: Function definition coverage
- **Lines**: Line-by-line coverage

Coverage reports are generated in:
- Terminal output (text format)
- `coverage/lcov.info` (LCOV format)
- `coverage/lcov-report/index.html` (HTML report)

## Test Environment

### Database Setup

Tests use a combination of:
- **Mocked database** for unit tests (fast, isolated)
- **Test database** for integration tests (real interactions)

Test database configuration:
```javascript
{
  host: process.env.TEST_DB_HOST || 'localhost',
  user: process.env.TEST_DB_USER || 'portfolio',
  password: process.env.TEST_DB_PASSWORD || 'securepassword',
  database: process.env.TEST_DB_NAME || 'portfolio_test'
}
```

### Environment Variables

Test environment uses secure defaults:
```javascript
NODE_ENV: 'test'
JWT_SECRET: 'test-jwt-secret-for-testing-only-32-chars'
DB_HOST: 'localhost'
DB_USER: 'test'
DB_PASSWORD: 'test'
DB_NAME: 'test_db'
```

## Test Data

### Fixtures

Test helpers provide factory functions for creating test data:

```javascript
// Create test user
const user = TestHelpers.createTestUserData({
  username: 'testuser',
  email: 'test@example.com'
});

// Create test project
const project = TestHelpers.createTestProjectData({
  title: 'Test Project',
  status: 'active'
});

// Create test GitHub repository
const repo = TestHelpers.createTestGitHubRepoData({
  name: 'test-repo',
  stars: 42
});
```

### Authentication

Test tokens are generated for authentication:
```javascript
const token = TestHelpers.generateTestToken(userId, username, role);
const expiredToken = TestHelpers.generateExpiredToken();
```

## Security Testing

### SQL Injection Prevention

Tests verify that all database queries use parameterized statements:
```javascript
// Malicious input
const maliciousId = "1'; DROP TABLE users; --";

// Should be safely parameterized
expect(mockDb.execute).toHaveBeenCalledWith(
  expect.stringContaining('WHERE id = ?'),
  [maliciousId]
);
```

### XSS Prevention

Tests ensure user input is properly sanitized:
```javascript
const xssPayload = '<script>alert("xss")</script>';
const response = await request(app)
  .post('/api/projects')
  .send({ title: xssPayload });

expect(response.status).toBe(400); // Should be rejected
```

### Authentication Security

Tests cover various authentication scenarios:
- Valid/invalid tokens
- Expired tokens
- Token manipulation
- Session management
- Rate limiting

## Performance Testing

### Database Performance

Tests measure query execution time:
```javascript
const startTime = Date.now();
const response = await request(app).get('/api/projects?limit=100');
const responseTime = Date.now() - startTime;

expect(responseTime).toBeLessThan(1000); // < 1 second
```

### Concurrency Testing

Tests verify handling of simultaneous requests:
```javascript
const promises = Array(20).fill().map(() =>
  request(app).get('/api/projects')
);

const responses = await Promise.all(promises);
expect(responses.every(r => r.status === 200)).toBe(true);
```

## Error Handling

### Database Errors

Tests verify graceful handling of database failures:
```javascript
mockDb.execute.mockRejectedValue(new Error('Connection failed'));

const response = await request(app).get('/api/projects');
expect(response.status).toBe(500);
expect(response.body.error).toBeDefined();
```

### Network Errors

Tests cover external service failures:
```javascript
axios.get.mockRejectedValue(new Error('Network timeout'));

const response = await request(app).post('/api/github/sync');
expect(response.status).toBe(503);
```

## Best Practices

### Test Organization

1. **Describe blocks** group related tests
2. **Clear test names** describe what is being tested
3. **Arrange-Act-Assert** pattern for test structure
4. **Setup/teardown** for clean test isolation

### Mock Usage

1. **Mock external dependencies** (axios, database)
2. **Reset mocks** between tests
3. **Verify mock calls** for interaction testing
4. **Use real implementations** when appropriate

### Assertions

1. **Specific assertions** over generic ones
2. **Status code validation** for API responses
3. **Response structure validation**
4. **Error message validation**

## Continuous Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Push to main branch
- Release creation

### Coverage Requirements

- Minimum 80% coverage required
- Coverage reports uploaded to code coverage services
- Failed tests block deployments

## Debugging Tests

### Running Individual Tests

```bash
# Run specific test file
jest auth.test.js

# Run specific test
jest --testNamePattern="should login successfully"

# Run with debugger
npm run test:debug
```

### Test Output

Use verbose mode for detailed output:
```bash
npm test -- --verbose
```

### Common Issues

1. **Database connection errors** - Check test database setup
2. **Port conflicts** - Ensure test environment isolation
3. **Timeout errors** - Increase test timeout if needed
4. **Mock failures** - Verify mock setup and reset

## Contributing

### Adding New Tests

1. Follow existing test patterns
2. Include security and performance considerations
3. Add appropriate fixtures and helpers
4. Update documentation

### Test Maintenance

1. Keep tests updated with code changes
2. Review coverage reports regularly
3. Refactor test utilities as needed
4. Monitor test performance

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#-testing-and-overall-quality-practices)