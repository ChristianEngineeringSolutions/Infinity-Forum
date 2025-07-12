'use strict';

const { queueStarOperation, generateStarIdempotencyKey } = require('./starQueueProcessor');
const { getStarQueue } = require('../config/redis');

/**
 * Queue a star passage operation for processing
 * This replaces the direct starPassage function with a queued version
 * 
 * @param {Object} sessionUser - The user performing the star operation
 * @param {Number} amount - Amount of stars to give
 * @param {String} passageID - ID of the passage to star
 * @param {String} userID - ID of the user whose stars are being used
 * @param {Boolean} deplete - Whether to deplete user's stars
 * @param {Boolean} single - Whether this is a single star operation
 * @returns {Promise<Object>} Job information including jobId and status
 */
async function starPassage(sessionUser, amount, passageID, userID, deplete = true, single = false) {
    try {
        // Generate idempotency key with timestamp and random component for uniqueness
        const timestamp = Date.now();
        const randomComponent = Math.random().toString(36).substring(7);
        const idempotencyKey = generateStarIdempotencyKey(
            userID,
            passageID,
            amount,
            `star-${deplete ? 'deplete' : 'nodeplete'}-${single ? 'single' : 'multi'}-${timestamp}-${randomComponent}`
        );
        
        // Queue the star operation
        const jobData = {
            userId: userID,
            passageId: passageID,
            amount: amount,
            sessionUserId: sessionUser._id.toString(),
            deplete: deplete,
            single: single,
            operation: 'star',
            idempotencyKey: idempotencyKey,
            timestamp: new Date().toISOString()
        };
        
        const jobId = await queueStarOperation(jobData);
        console.log("Queued Job with ID:", jobId);
        
        // For debugging: show the idempotency key
        console.log("Idempotency key for this operation:", idempotencyKey);
        
        // Check queue status
        const starQueue = getStarQueue();
        if (starQueue) {
            const jobCounts = await starQueue.getJobCounts();
            console.log('Queue job counts:', jobCounts);
            
            // Check for stalled jobs
            const stalledJobs = await starQueue.getJobs(['stalled']);
            if (stalledJobs && stalledJobs.length > 0) {
                console.log('Stalled jobs found:', stalledJobs.length);
            }
            
            // Get all jobs to see what's in the queue
            const allJobs = await starQueue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed', 'stalled']);
            console.log('Total jobs in queue:', allJobs.length);
            for (const job of allJobs) {
                console.log(`Job ${job.id} - Status: ${await job.getState()}`);
            }
            
            // Check for failed jobs
            const failedJobs = await starQueue.getFailed();
            if (failedJobs.length > 0) {
                console.log('Failed jobs found:', failedJobs.length);
                for (const job of failedJobs) {
                    console.log(`Failed job ${job.id}:`, job.failedReason);
                    if (job.stacktrace) {
                        console.log('Stacktrace:', job.stacktrace[0]);
                    }
                    // Clean up old failed jobs to prevent confusion
                    console.log('Removing old failed job:', job.id);
                    await job.remove();
                }
            }
        }
        
        // Return job information for tracking
        return {
            success: true,
            jobId: jobId,
            idempotencyKey: idempotencyKey,
            status: 'queued',
            message: 'Star operation queued for processing'
        };
        
    } catch (error) {
        console.error('Error queuing star passage:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to queue star operation'
        };
    }
}

/**
 * Queue a single star passage operation
 * 
 * @param {Object} sessionUser - The user performing the star operation
 * @param {Object} passage - The passage to star
 * @param {Boolean} reverse - Whether to unstar (reverse the operation)
 * @param {Boolean} isSub - Whether this is a sub-passage
 * @returns {Promise<Object>} Job information
 */
async function singleStarPassage(sessionUser, passage, reverse = false, isSub = false) {
    try {
        // Generate idempotency key with timestamp and random component for uniqueness
        const timestamp = Date.now();
        const randomComponent = Math.random().toString(36).substring(7);
        const idempotencyKey = generateStarIdempotencyKey(
            sessionUser._id.toString(),
            passage._id.toString(),
            1,
            `singlestar-${reverse ? 'reverse' : 'forward'}-${isSub ? 'sub' : 'main'}-${timestamp}-${randomComponent}`
        );
        
        // Queue the operation
        const jobData = {
            sessionUserId: sessionUser._id.toString(),
            passageId: passage._id.toString(),
            reverse: reverse,
            isSub: isSub,
            operation: 'singleStar',
            idempotencyKey: idempotencyKey,
            timestamp: new Date().toISOString()
        };
        
        const jobId = await queueStarOperation(jobData);
        
        return {
            success: true,
            jobId: jobId,
            idempotencyKey: idempotencyKey,
            status: 'queued',
            message: 'Single star operation queued for processing'
        };
        
    } catch (error) {
        console.error('Error queuing single star passage:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to queue single star operation'
        };
    }
}

/**
 * Get the status of a star job
 * 
 * @param {String} jobId - The job ID to check
 * @returns {Promise<Object>} Job status information
 */
async function getStarJobStatus(jobId) {
    try {
        const starQueue = getStarQueue();
        if (!starQueue) {
            throw new Error('Star queue not initialized');
        }
        
        const job = await starQueue.getJob(jobId);
        if (!job) {
            return {
                success: false,
                message: 'Job not found',
                jobId: jobId
            };
        }
        
        const state = await job.getState();
        const progress = job.progress();
        
        return {
            success: true,
            jobId: jobId,
            state: state,
            progress: progress,
            data: job.data,
            result: job.returnvalue,
            failedReason: job.failedReason,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn
        };
        
    } catch (error) {
        console.error('Error getting star job status:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to get job status'
        };
    }
}

/**
 * Wait for a star job to complete
 * 
 * @param {String} jobId - The job ID to wait for
 * @param {Number} timeout - Maximum time to wait in milliseconds (default: 30000)
 * @returns {Promise<Object>} Job result
 */
async function waitForStarJob(jobId, timeout = 30000) {
    try {
        const starQueue = getStarQueue();
        if (!starQueue) {
            throw new Error('Star queue not initialized');
        }
        
        const job = await starQueue.getJob(jobId);
        if (!job) {
            throw new Error('Job not found');
        }
        
        // Wait for job to complete or fail
        const result = await job.waitUntilFinished(timeout);
        
        return {
            success: true,
            jobId: jobId,
            result: result
        };
        
    } catch (error) {
        console.error('Error waiting for star job:', error);
        return {
            success: false,
            error: error.message,
            message: error.message.includes('timeout') ? 'Job processing timeout' : 'Failed to wait for job'
        };
    }
}

/**
 * Batch queue multiple star operations
 * 
 * @param {Array} operations - Array of star operations to queue
 * @returns {Promise<Object>} Batch operation results
 */
async function batchStarOperations(operations) {
    const results = [];
    
    for (const op of operations) {
        let result;
        
        if (op.type === 'star') {
            result = await starPassage(
                op.sessionUser,
                op.amount,
                op.passageId,
                op.userId,
                op.deplete,
                op.single
            );
        } else if (op.type === 'singleStar') {
            result = await singleStarPassage(
                op.sessionUser,
                op.passage,
                op.reverse,
                op.isSub
            );
        } else {
            result = {
                success: false,
                error: 'Unknown operation type',
                operation: op
            };
        }
        
        results.push(result);
    }
    
    return {
        success: true,
        operations: operations.length,
        results: results
    };
}

// Export the queue-based interface
module.exports = {
    starPassage,
    singleStarPassage,
    getStarJobStatus,
    waitForStarJob,
    batchStarOperations,
    
    // Re-export these for compatibility
    addStarsToUser: require('./starService').addStarsToUser,
    starSources: require('./starService').starSources,
    singleStarSources: require('./starService').singleStarSources
};