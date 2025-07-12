'use strict';

const redis = require('redis');
const Queue = require('bull');

// Initialize Redis client and Bull queue
let redisClient;
let feedQueue;
let starQueue;

// Redis operations object (redis v5 methods are already async)
const redisOps = {};

async function initializeRedis() {
    try {
        console.log('Initializing Redis...');
        
        // Initialize Redis client with v5 API
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('Too many Redis reconnection attempts');
                        return new Error('Too many retries');
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        });

        redisClient.on('error', (error) => {
            console.error('Redis client error:', error);
        });

        // Connect to Redis (v5 requires explicit connect)
        await redisClient.connect();
        console.log('Connected to Redis');

        // Set up Redis operations (v5 methods are already async)
        redisOps.get = redisClient.get.bind(redisClient);
        redisOps.set = redisClient.set.bind(redisClient);
        redisOps.del = redisClient.del.bind(redisClient);
        redisOps.keys = redisClient.keys.bind(redisClient);
        redisOps.exists = redisClient.exists.bind(redisClient);
        redisOps.zAdd = redisClient.zAdd.bind(redisClient);
        redisOps.zRange = redisClient.zRange.bind(redisClient);
        
        // Initialize Bull queue for background processing (from sasame.js line 57)
        feedQueue = new Queue('feed-generation', process.env.REDIS_URL || 'redis://localhost:6379');
        
        feedQueue.on('error', (error) => {
            console.error('Feed queue error:', error);
        });
        
        // Initialize star queue for sequential star processing
        starQueue = new Queue('star-processing', process.env.REDIS_URL || 'redis://localhost:6379', {
            defaultJobOptions: {
                removeOnComplete: false,  // Keep completed jobs for idempotency checks
                removeOnFail: false,      // Keep failed jobs for debugging
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            }
        });
        
        starQueue.on('error', (error) => {
            console.error('Star queue error:', error);
        });
        console.log('Redis initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing Redis:', error);
        return false;
    }
}

// Getter functions to access Redis components
function getRedisClient() {
    return redisClient;
}

function getRedisOps() {
    return redisOps;
}

function getFeedQueue() {
    return feedQueue;
}

function getStarQueue() {
    return starQueue;
}

// Check if Redis is available and ready
function isRedisReady() {
    return redisClient && redisClient.isReady;
}

module.exports = {
    initializeRedis,
    getRedisClient,
    getRedisOps,
    getFeedQueue,
    getStarQueue,
    isRedisReady
};