import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment setup
    environment: 'node',
    
    // Global test setup and teardown
    globalSetup: ['./tests/utils/globalSetup.js'],
    setupFiles: ['./tests/utils/setupFiles.js'],
    
    // Test file patterns
    include: [
      'tests/**/*.test.js',
      'tests/**/*.spec.js'
    ],
    
    // Test timeout (30 seconds for integration tests)
    timeout: 30000,
    
    // Hook timeout
    hookTimeout: 30000,
    
    // Number of threads
    threads: false, // Disable threading for database tests
    
    // Test coverage (optional)
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'backup/',
        'dump/'
      ]
    },
    
    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Test isolation
    isolate: true,
    
    // Environment variables for testing
    env: {
      NODE_ENV: 'test',
      MONGODB_TEST_URI: 'mongodb://localhost:27017/sasame_test',
      STRIPE_SECRET_KEY: 'sk_test_fake_key_for_testing',
      STRIPE_ENDPOINT_SECRET_KEY: 'whsec_fake_webhook_secret_for_testing',
      EMAIL_USERNAME: 'test@example.com',
      EMAIL_PASSWORD: 'fake_password',
      REMOTE: 'false',
      LOCAL: 'true'
    }
  },
  
  // Resolve configuration for imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@controllers': path.resolve(__dirname, './controllers'),
      '@models': path.resolve(__dirname, './models'),
      '@services': path.resolve(__dirname, './services'),
      '@utils': path.resolve(__dirname, './utils'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});