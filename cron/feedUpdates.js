var cron = require('node-cron');
const { User } = require('../models/User');
const passageService = require('../services/passageService');

// Run every 3 hours for highly active users (logged in within last 24 hours)
const highActivityJob = cron.schedule('0 */3 * * *', async () => {
    console.log('Running feed updates for highly active users...');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await User.find({
        lastLogin: { $gte: oneDayAgo }
    });
    
    for (const user of activeUsers) {
        try {
            const feedQueue = require('../config/redis').getFeedQueue();
            await feedQueue.add(
                { userId: user._id.toString() },
                { 
                    jobId: `feed-update-${user._id}`,
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );
        } catch (error) {
            console.error(`Error queuing feed update for user ${user._id}:`, error);
        }
    }
    console.log(`Queued feed updates for ${activeUsers.length} highly active users`);
});

// Run every 6 hours for moderately active users (logged in within last 72 hours but not last 24 hours)
const moderateActivityJob = cron.schedule('0 */6 * * *', async () => {
    console.log('Running feed updates for moderately active users...');
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activeUsers = await User.find({
        lastLogin: { 
            $lt: oneDayAgo,
            $gte: threeDaysAgo 
        }
    });
    
    for (const user of activeUsers) {
        try {
            const feedQueue = require('../config/redis').getFeedQueue();
            await feedQueue.add(
                { userId: user._id.toString() },
                { 
                    jobId: `feed-update-${user._id}`,
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );
        } catch (error) {
            console.error(`Error queuing feed update for user ${user._id}:`, error);
        }
    }
    console.log(`Queued feed updates for ${activeUsers.length} moderately active users`);
});

// Run every 12 hours for less active users (logged in within last 7 days but not last 72 hours)
const lowActivityJob = cron.schedule('0 */12 * * *', async () => {
    console.log('Running feed updates for less active users...');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    
    const activeUsers = await User.find({
        lastLogin: { 
            $lt: threeDaysAgo,
            $gte: sevenDaysAgo 
        }
    });
    
    for (const user of activeUsers) {
        try {
            const feedQueue = require('../config/redis').getFeedQueue();
            await feedQueue.add(
                { userId: user._id.toString() },
                { 
                    jobId: `feed-update-${user._id}`,
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );
        } catch (error) {
            console.error(`Error queuing feed update for user ${user._id}:`, error);
        }
    }
    console.log(`Queued feed updates for ${activeUsers.length} less active users`);
});

// Run daily for remaining users (those who logged in more than 7 days ago but less than 30 days ago)
const dailyJob = cron.schedule('0 0 * * *', async () => {
    console.log('Running daily feed updates for remaining active users...');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const remainingUsers = await User.find({
        lastLogin: { 
            $lt: sevenDaysAgo,
            $gte: thirtyDaysAgo 
        }
    });
    
    for (const user of remainingUsers) {
        try {
            const feedQueue = require('../config/redis').getFeedQueue();
            await feedQueue.add(
                { userId: user._id.toString() },
                { 
                    jobId: `feed-update-${user._id}`,
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );
        } catch (error) {
            console.error(`Error queuing feed update for user ${user._id}:`, error);
        }
    }
    console.log(`Queued feed updates for ${remainingUsers.length} remaining active users`);
});

// Clean up old repeating jobs on startup
async function cleanupOldRepeatingJobs() {
    try {
        const feedQueue = require('../config/redis').getFeedQueue();
        const repeatableJobs = await feedQueue.getRepeatableJobs();
        
        console.log(`Found ${repeatableJobs.length} repeating feed jobs to clean up`);
        
        for (const job of repeatableJobs) {
            await feedQueue.removeRepeatableByKey(job.key);
        }
        
        console.log('Cleaned up old repeating feed jobs');
    } catch (error) {
        console.error('Error cleaning up old repeating jobs:', error);
    }
}

// Export all jobs and cleanup function
module.exports = {
    start: () => {
        // Clean up old repeating jobs first
        cleanupOldRepeatingJobs();
        
        // Start the cron jobs
        highActivityJob.start();
        moderateActivityJob.start();
        lowActivityJob.start();
        // dailyJob.start();
    },
    stop: () => {
        highActivityJob.stop();
        moderateActivityJob.stop();
        lowActivityJob.stop();
        dailyJob.stop();
    }
};