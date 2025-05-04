const {accessSecret, 
    scripts, percentStarsGiven,
     percentUSD, totalUSD, 
     totalStarsGiven} = require('./common-utils');
const {User, UserSchema} = require('./models/User');
const crypto = require('crypto');
const Bull = require('bull');

// Rate limiting configuration
const RATE_LIMIT = {
    STRIPE_RATE_LIMIT: 100, // Stripe allows 100 requests per second
    BATCH_SIZE: 20,         // Process 20 users at a time
    CONCURRENT_REQUESTS: 10, // Maximum concurrent Stripe API calls
    RETRY_DELAYS: [1000, 2000, 4000, 8000], // Exponential backoff in ms
};

// Create Bull queue
const rewardQueue = new Bull('reward-distribution', {
    redis: { port: 6379, host: '127.0.0.1' }, // Configure as needed
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: false,
        removeOnFail: false,
    },
});

// Utility function for exponential backoff retries
async function withRetry(fn, context, maxRetries = RATE_LIMIT.RETRY_DELAYS.length) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            
            // Check if error is retryable
            if (error?.raw?.code === 'rate_limit' || 
                error?.code === 'rate_limit' ||
                error?.statusCode >= 500) {
                
                const delay = RATE_LIMIT.RETRY_DELAYS[attempt] || RATE_LIMIT.RETRY_DELAYS[RATE_LIMIT.RETRY_DELAYS.length - 1];
                console.log(`Retry attempt ${attempt + 1} for ${context}. Waiting ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Non-retryable error
                throw error;
            }
        }
    }
}

// Generate idempotency key
function generateIdempotencyKey(userId, transactionType, timestamp) {
    return crypto.createHash('sha256')
        .update(`${userId}-${transactionType}-${timestamp}`)
        .digest('hex');
}

// Rate limiter
class RateLimiter {
    constructor(limit, windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.requests = [];
    }

    async wait() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);

        if (this.requests.length >= this.limit) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = oldestRequest + this.windowMs - now;
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.wait();
            }
        }

        this.requests.push(now);
    }
}

// Process users in batches with concurrency limit
async function processBatchWithConcurrency(items, batchProcessor, concurrencyLimit) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
        const promise = batchProcessor(item).then(result => {
            executing.delete(promise);
            return result;
        });

        results.push(promise);
        executing.add(promise);

        if (executing.size >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

// Main reward logic (extracted for queue processing)
async function processRewardDistribution(job) {
    const { jobId, timestamp } = job.data;
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    
    // Initialize rate limiter (100 requests per second)
    const rateLimiter = new RateLimiter(RATE_LIMIT.STRIPE_RATE_LIMIT, 1000);
    
    const users = await User.find({ stripeOnboardingComplete: true });
    const usd = await scripts.getMaxToGiveOut();
    let totalCut = 0;
    const successfulTransfers = [];
    const failedTransfers = [];

    // Update job status
    await job.progress(0);
    await job.log(`Starting reward distribution for ${users.length} users`);

    // Process users in batches
    for (let i = 0; i < users.length; i += RATE_LIMIT.BATCH_SIZE) {
        const batch = users.slice(i, i + RATE_LIMIT.BATCH_SIZE);
        const batchNumber = Math.floor(i / RATE_LIMIT.BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(users.length / RATE_LIMIT.BATCH_SIZE);
        
        await job.log(`Processing batch ${batchNumber}/${totalBatches}`);
        await job.progress(Math.round((i / users.length) * 90)); // 0-90% for user processing

        const batchResults = await processBatchWithConcurrency(
            batch,
            async (user) => {
                // if(!user.paymentsLocked){
                    //appropriate percentage based on stars
                    //users get same allotment as they have percentage of stars given
                    let userUSD = parseInt((await percentStarsGiven(user.starsGiven)) * usd);
                    try{
                        // if(user.amountEarnedThisYear + (userUSD/100) > 600){
                        //     userUSD = 600 - user.amountEarnedThisYear;
                        // }
                        const cut = (userUSD*0.05);
                        const transferAmount = Math.floor(userUSD - cut);

                        // Generate idempotency key
                        const idempotencyKey = generateIdempotencyKey(
                            user._id,
                            'transfer',
                            timestamp // Use job timestamp for consistency
                        );

                        // Rate limiting
                        await rateLimiter.wait();

                        const transfer = await withRetry(
                            () => stripe.transfers.create({
                                //take 5%
                                amount: transferAmount,
                                currency: "usd",
                                destination: user.stripeAccountId,
                            }, {
                                idempotencyKey: idempotencyKey,
                            }),
                            `transfer for user ${user._id}`
                        );
                        totalCut += cut;
                        // if(user.amountEarnedThisYear + (userUSD/100) > 600){
                        //     user.amountEarned += 600 - user.amountEarnedThisYear;
                        //     user.amountEarnedThisYear += 600 - user.amountEarnedThisYear;
                        //     user.paymentsLocked = true;
                        // }else{
                        //     user.amountEarned += userUSD / 100;
                        //     user.amountEarnedThisYear += userUSD / 100;
                        // }

                        // Track successful transfer
                        successfulTransfers.push({
                            userId: user._id,
                            transferId: transfer.id,
                            amount: transferAmount,
                            cut: cut,
                        });

                        return { success: true, cut };
                    }
                    catch(err){
                        console.log(err);
                        await job.log(`Error for user ${user._id}: ${err.message}`);
                        failedTransfers.push({
                            userId: user._id,
                            error: err.message,
                        });
                        return { success: false, error: err };
                    }
                // }
            },
            RATE_LIMIT.CONCURRENT_REQUESTS
        );

        // Add small delay between batches to be conservative with rate limits
        if (i + RATE_LIMIT.BATCH_SIZE < users.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    await job.log("Users paid");
    console.log("Users paid.");
    await job.log(`Users processed: ${successfulTransfers.length} successful, ${failedTransfers.length} failed`);
    await job.progress(95);

    //pay the platform the leftover money
    if (totalCut > 0) {
        const payoutIdempotencyKey = generateIdempotencyKey(
            'platform',
            'payout',
            timestamp
        );

        try {
            const payout = await withRetry(
                () => stripe.payouts.create({
                    amount: Math.floor(totalCut),
                    currency: 'usd',
                }, {
                    idempotencyKey: payoutIdempotencyKey,
                }),
                'platform payout'
            );
            await job.log(`Platform payout created: ${payout.id}, amount: ${totalCut}`);
        } catch (err) {
            await job.log(`Failed to create platform payout: ${err.message}`);
            throw err; // This will trigger job retry
        }
    }

    await job.progress(100);

    // Return summary
    return {
        summary: {
            totalUsers: users.length,
            successfulTransfers: successfulTransfers.length,
            failedTransfers: failedTransfers.length,
            totalPaidOut: successfulTransfers.reduce((sum, t) => sum + t.amount, 0),
            totalCut: totalCut,
        },
        details: {
            successful: successfulTransfers,
            failed: failedTransfers,
        },
    };
}

// Queue processor
rewardQueue.process(async (job) => {
    console.log(`Processing job ${job.id}`);
    return await processRewardDistribution(job);
});

// Queue event handlers
rewardQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
});

rewardQueue.on('failed', (job, err) => {
    console.log(`Job ${job.id} failed:`, err.message);
});

rewardQueue.on('progress', (job, progress) => {
    console.log(`Job ${job.id} ${progress}% complete`);
});

// Public API function to queue reward distribution
async function queueRewardDistribution() {
    const timestamp = Date.now().toString();
    const job = await rewardQueue.add({
        jobId: `reward-distribution-${timestamp}`,
        timestamp: timestamp,
    }, {
        priority: 1,
        attempts: 3,
        jobId: `reward-distribution-${timestamp}`, // Prevents duplicate jobs
    });

    console.log(`Queued reward distribution job ${job.id}`);
    return {
        jobId: job.id,
        status: 'queued',
    };
}

// Check job status
async function getRewardJobStatus(jobId) {
    const job = await rewardQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress();
    const logs = await rewardQueue.getJobLogs(jobId);

    return {
        jobId: job.id,
        state: state,
        progress: progress,
        logs: logs.logs,
        data: job.data,
        result: job.returnvalue,
    };
}

// Clean up old jobs
async function cleanupOldJobs(days = 7) {
    const before = Date.now() - (days * 24 * 60 * 60 * 1000);
    await rewardQueue.clean(before, 'completed');
    await rewardQueue.clean(before, 'failed');
}

// Export for use
module.exports = {
    queueRewardDistribution,
    getRewardJobStatus,
    cleanupOldJobs,
    rewardQueue,
};