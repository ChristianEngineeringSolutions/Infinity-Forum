import { beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import nock from 'nock';

// Setup that runs before each test
beforeEach(async () => {
  // Clear nock interceptors
  nock.cleanAll();
  
  // Connect to test database if not connected
  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_TEST_URI;
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  }
  
  // Clear all collections before each test
  const collections = Object.keys(mongoose.connection.collections);
  for (const collectionName of collections) {
    const collection = mongoose.connection.collections[collectionName];
    await collection.deleteMany({});
  }
});

// Cleanup after each test
afterEach(async () => {
  // Clear nock interceptors
  nock.cleanAll();
  
  // Reset any other test state
  jest.clearAllMocks?.();
});