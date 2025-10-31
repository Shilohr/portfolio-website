# Testing Infrastructure for Portfolio Website

This document provides comprehensive information about the testing infrastructure implemented for the portfolio website.

## Overview

The testing infrastructure includes:
- **Backend Testing**: Jest-based unit and integration tests for API routes and database operations
- **Frontend Testing**: Browser-based testing for JavaScript functionality and user interactions
- **Database Testing**: Integration tests with MySQL database operations
- **Security Testing**: Tests for authentication, authorization, and input validation

## Backend Testing

### Setup

1. Install dependencies:
```bash
cd src/api
npm install
```

2. Set up test database environment variables in `.env`:
```env
TEST_DB_HOST=localhost
TEST_DB_USER=portfolio
TEST_DB_PASSWORD=securepassword
TEST_DB_NAME=portfolio_test
JWT_SECRET=test-jwt-secret-for-testing-only
```

3. Create test database:
```sql
CREATE DATABASE portfolio_test;
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Test Structure

```
src/api/tests/
├── setup.js                 # Global test setup and utilities
├── unit/
│   ├── auth.test.js         # Authentication route tests
│   ├── projects.test.js     # Projects route tests
│   └── utils.test.js        # Utility function tests
└── integration/
    ├── auth.integration.test.js      # Authentication integration tests
    ├── projects.integration.test.js  # Projects integration tests
    └── database.integration.test.js # Database integration tests
```

### Key Features

- **Database Isolation**: Each test runs with a clean database
- **Mock Support**: Automatic mocking of external dependencies
- **Transaction Testing**: Tests database transaction rollback scenarios
- **Security Testing**: Validates SQL injection prevention and input sanitization
- **Coverage Reports**: Detailed code coverage analysis

## Frontend Testing

### Running Tests

1. Open the test runner in your browser:
```
http://localhost:8080/tests/frontend.test.html
```

2. Click "Run All Tests" or run specific test suites

### Test Categories

#### Authentication Tests
- Token storage and retrieval
- Form validation
- API call mocking
- Logout functionality

#### Projects Tests
- Project data structure validation
- Technology tag generation
- Date formatting
- Search functionality
- Pagination logic

#### Utility Tests
- URL validation
- String sanitization
- Array operations
- Error handling
- LocalStorage operations

#### Integration Tests
- Cross-module data flow
- Error handling consistency
- State management

### Test Framework

The frontend tests use a custom testing framework built with vanilla JavaScript that includes:
- Test assertion utilities
- Mock fetch API
- DOM manipulation helpers
- Event simulation
- Async test support

## Database Testing

### Test Database Setup

The test suite automatically:
1. Creates a test database if it doesn't exist
2. Loads the database schema
3. Cleans data between tests
4. Handles transactions and rollbacks

### Test Coverage

- **User Management**: Registration, login, account locking
- **Project CRUD**: Create, read, update, delete operations
- **Session Management**: Token validation and session cleanup
- **Audit Logging**: Action tracking and data integrity
- **Foreign Key Constraints**: Referential integrity validation
- **Transaction Handling**: Rollback scenarios and data consistency

## Security Testing

### Authentication Security
- Password hashing and verification
- JWT token generation and validation
- Account lockout after failed attempts
- Session management and cleanup
- Rate limiting validation

### Input Validation
- SQL injection prevention
- XSS protection
- Email format validation
- Password strength requirements
- URL validation

### API Security
- Authorization checks
- CORS configuration
- Rate limiting
- Request size limits
- Error message sanitization

## Test Configuration

### Jest Configuration (Backend)

```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: [
    'auth.js',
    'projects.js',
    'github.js',
    'server.js'
  ],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
```

### Environment Variables

```env
NODE_ENV=test
JWT_SECRET=test-jwt-secret-for-testing-only
TEST_DB_HOST=localhost
TEST_DB_USER=portfolio
TEST_DB_PASSWORD=securepassword
TEST_DB_NAME=portfolio_test
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: password
          MYSQL_DATABASE: portfolio_test
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: cd src/api && npm install
      - run: cd src/api && npm test
```

## Best Practices

### Test Writing
1. **Arrange, Act, Assert**: Structure tests clearly
2. **Descriptive Names**: Use clear test descriptions
3. **Test Isolation**: Each test should be independent
4. **Mock External Dependencies**: Avoid real network calls
5. **Cover Edge Cases**: Test both success and failure scenarios

### Database Tests
1. **Use Transactions**: Rollback changes after each test
2. **Test Constraints**: Validate foreign keys and unique constraints
3. **Performance Testing**: Ensure queries use indexes effectively
4. **Data Integrity**: Test cascade operations and data consistency

### Security Tests
1. **Input Validation**: Test all input validation rules
2. **Authentication Flows**: Test complete auth workflows
3. **Authorization**: Verify role-based access control
4. **Error Handling**: Ensure sensitive data isn't leaked

## Coverage Reports

After running tests with coverage (`npm run test:coverage`), reports are generated in:
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - LCOV format for CI tools

### Target Coverage Goals
- **Statements**: >90%
- **Branches**: >85%
- **Functions**: >95%
- **Lines**: >90%

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify test database exists
   - Check connection credentials
   - Ensure MySQL service is running

2. **Test Timeouts**
   - Increase test timeout in jest.config.js
   - Check for infinite loops or hanging promises

3. **Mock Failures**
   - Clear mocks between tests
   - Verify mock setup matches actual API calls

4. **Frontend Test Issues**
   - Ensure browser console is open for debugging
   - Check for CORS issues when mocking fetch

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=true
NODE_ENV=test
```

## Contributing

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for API endpoints
3. Include frontend tests for user interactions
4. Update documentation
5. Ensure coverage targets are met

## Future Enhancements

- **E2E Testing**: Add Cypress or Playwright for end-to-end tests
- **Performance Testing**: Load testing for API endpoints
- **Visual Regression Testing**: Screenshot comparison tests
- **Accessibility Testing**: Automated accessibility validation
- **API Contract Testing**: OpenAPI/Swagger validation tests