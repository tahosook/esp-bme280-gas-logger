module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'gs'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'gas/**/*.gs',
    '!gas/SetupTriggers.gs',
    '!gas/DebugTest.gs'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  }
};
