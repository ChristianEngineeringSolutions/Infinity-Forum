import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod = null;

// Global setup - runs once before all tests
export async function setup() {
  console.log('Setting up test environment...');
  
  // Start in-memory MongoDB for testing
  mongod = await MongoMemoryServer.create({
    instance: {
      port: 27018, // Use different port from development
      dbName: 'sasame_test'
    }
  });

  const mongoUri = mongod.getUri();
  process.env.MONGODB_TEST_URI = mongoUri;
  
  console.log(`Test MongoDB started at: ${mongoUri}`);
}

// Global teardown - runs once after all tests
export async function teardown() {
  console.log('Tearing down test environment...');
  
  if (mongod) {
    await mongod.stop();
    console.log('Test MongoDB stopped');
  }
}