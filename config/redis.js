'use strict';

const redis = require('redis');
const Queue = require('bull');
const { promisify } = require('util');

// Initialize Redis client and Bull queue
let redisClient;
let feedQueue;
let starQueue;

// Promisified Redis methods object
const redisOps = {};

async function initializeRedis() {
    try {
        console.log('Initializing Redis...');
        
        // Initialize Redis client without using connect() (from sasame.js lines 10181-10190)
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            retry_strategy: function(options) {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    console.error('Redis connection refused. Retrying...');
                    return Math.min(options.attempt * 100, 3000);
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });

        redisClient.on('error', (error) => {
            console.error('Redis client error:', error);
        });

        redisClient.on('ready', () => {
            console.log('Connected to Redis');
        });

        // Promisify Redis methods for easier async/await usage (from sasame.js lines 10201-10207)
        redisOps.get = promisify(redisClient.get).bind(redisClient);
        redisOps.set = promisify(redisClient.set).bind(redisClient);
        redisOps.del = promisify(redisClient.del).bind(redisClient);
        redisOps.keys = promisify(redisClient.keys).bind(redisClient);
        redisOps.exists = promisify(redisClient.exists).bind(redisClient);
        redisOps.zadd = promisify(redisClient.zadd).bind(redisClient);
        redisOps.zrevrange = promisify(redisClient.zrevrange).bind(redisClient);
        
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
    return redisClient && redisClient.ready;
}

module.exports = {
    initializeRedis,
    getRedisClient,
    getRedisOps,
    getFeedQueue,
    getStarQueue,
    isRedisReady
};