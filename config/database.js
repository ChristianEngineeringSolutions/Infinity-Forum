'use strict';

const mongoose = require('mongoose');
const { accessSecret } = require('../common-utils');

// Database configuration and connection setup

async function connectDatabase() {
    try {
        // Database Connection Setup (from line 397)
        await mongoose.connect((await accessSecret("MONGODB_CONNECTION_URL")), {
            useNewUrlParser: true,
            useCreateIndex: true,
            useFindAndModify: false,
            useUnifiedTopology: true
        });
        
        console.log('Connected to MongoDB');
        
        // Setup database indexes (from line 372)
        await setupDatabaseIndexes();
        
    } catch (err) {
        console.error('MongoDB connection error:', err);
        // Implement proper cleanup
        process.exit(1);
    }
}

async function setupDatabaseIndexes() {
  try {
    console.log("Setting up database indexes...");
    
    // Create indexes one by one with error handling (from line 308)
    const indexOperations = [
      // Basic indexes
      { collection: 'passages', index: { versionOf: 1 } },
      { collection: 'passages', index: { personal: 1 } },
      { collection: 'passages', index: { deleted: 1 } },
      { collection: 'passages', index: { author: 1 } },
      { collection: 'passages', index: { sourceList: 1 } },
      { collection: 'passages', index: { date: -1 } },
      { collection: 'passages', index: { stars: -1 } },
      
      // Compound indexes
      { 
        collection: 'passages', 
        index: { versionOf: 1, personal: 1, deleted: 1, date: -1, stars: -1 },
        options: { name: 'feed_main_index' }
      },
      { 
        collection: 'passages', 
        index: { versionOf: 1, personal: 1, deleted: 1, author: 1 },
        options: { name: 'feed_author_index' }
      },
      { 
        collection: 'passages', 
        index: { versionOf: 1, personal: 1, deleted: 1, "passages.0": 1 },
        options: { name: 'feed_passages_index' }
      }
    ];

    // Execute index creation operations
    for (const operation of indexOperations) {
      try {
        const collection = mongoose.connection.db.collection(operation.collection);
        await collection.createIndex(operation.index, operation.options || {});
        console.log(`✓ Index created for ${operation.collection}:`, operation.index);
      } catch (error) {
        if (error.code === 85) { // Index already exists
          console.log(`Index already exists for ${operation.collection}:`, operation.index);
        } else {
          console.error(`Error creating index for ${operation.collection}:`, error);
        }
      }
    }
    
    console.log("Database indexes setup completed");
  } catch (error) {
    console.error("Error in setupDatabaseIndexes:", error);
  }
}

module.exports = {
    connectDatabase,
    setupDatabaseIndexes
};