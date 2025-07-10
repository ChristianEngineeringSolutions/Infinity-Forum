'use strict';

const { startStarQueueProcessor, cleanupOldProcessedKeys } = require('./starQueueProcessor');
const { isRedisReady } = require('../config/redis');

/**
 * Initialize the star queue processing system
 * This should be called after Redis is initialized in your main application
 */
async function initializeStarQueue() {
    try {
        // Check if Redis is ready
        if (!isRedisReady()) {
            throw new Error('Redis is not ready. Please initialize Redis first.');
        }
        
        console.log('Initializing star queue processing system...');
        
        // Start the queue processor
        await startStarQueueProcessor();
        
        // Schedule periodic cleanup of old processed keys (daily)
        setInterval(async () => {
            try {
                console.log('Running star queue cleanup...');
                const cleaned = await cleanupOldProcessedKeys(30); // Keep for 30 days
                console.log(`Cleaned ${cleaned} old star operation keys`);
            } catch (error) {
                console.error('Error during star queue cleanup:', error);
            }
        }, 24 * 60 * 60 * 1000); // Run once per day
        
        console.log('Star queue processing system initialized successfully');
        
        return true;
    } catch (error) {
        console.error('Failed to initialize star queue processing system:', error);
        return false;
    }
}

module.exports = {
    initializeStarQueue
};