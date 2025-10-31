module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'auth.js',
    'projects.js',
    'github.js',
    'server.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Test environment setup
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  // Database mocking for unit tests
  moduleNameMapper: {
    '^mysql2/promise$': '<rootDir>/tests/mocks/mysql2.js'
  },
  // Performance monitoring
  maxWorkers: '50%',
  // Additional test patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/'
  ],
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  // Test runner options
  runner: 'jest-runner',
  
};