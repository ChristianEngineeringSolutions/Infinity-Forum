const {accessSecret, 
    scripts, percentStarsGiven,
     percentUSD, totalUSD, 
     totalStarsGiven} = require('./common-utils');
const {User, UserSchema} = require('./models/User');
const System = require('./models/System');
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

// Generate idempotency key based on reward period
function generateIdempotencyKey(userId, transactionType, rewardPeriod) {
    return crypto.createHash('sha256')
        .update(`${userId}-${transactionType}-${rewardPeriod}`)
        .digest('hex');
}

// Get reward period string (e.g., "2024-01" for January 2024)
function getRewardPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
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
    var indexInBatch = 0;
    for (const item of items) {
        const promise = batchProcessor(item, indexInBatch++).then(result => {
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
    const { jobId, timestamp, rewardPeriod } = job.data;
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    
    // Initialize rate limiter (100 requests per second)
    const rateLimiter = new RateLimiter(RATE_LIMIT.STRIPE_RATE_LIMIT, 1000);
    
    // const users = await User.find({ stripeOnboardingComplete: true,  identityVerified: true}).sort('-starsGiven');
    const users = await User.find({}).sort({ starsGiven: -1, _id: 1 });
    // const starValues = users.map(doc => doc.starsGiven);
    // const usd = await scripts.getMaxToGiveOut();
    var SYSTEM = await System.findOne({});
    // var usd = SYSTEM.userAmount;
    var usd = await scripts.getMaxToGiveOut();
    let totalCut = 0;
    const successfulTransfers = [];
    const failedTransfers = [];

    // Update job status
    await job.progress(0);
    await job.log(`Starting reward distribution for ${users.length} users`);

    // Process users in batches
    var shouldContinue = true;
    for (let i = 0; i < users.length && shouldContinue; i += RATE_LIMIT.BATCH_SIZE) {
        const batch = users.slice(i, i + RATE_LIMIT.BATCH_SIZE);
        const batchNumber = Math.floor(i / RATE_LIMIT.BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(users.length / RATE_LIMIT.BATCH_SIZE);
        
        await job.log(`Processing batch ${batchNumber}/${totalBatches}`);
        await job.progress(Math.round((i / users.length) * 90)); // 0-90% for user processing

        const batchResults = await processBatchWithConcurrency(
            batch,
            async (user, indexInBatch) => {
                // if(!user.paymentsLocked){
                    //appropriate percentage based on stars
                    //users get same allotment as they have percentage of stars given
                    let userUSD = parseInt((await percentStarsGiven(user.starsGiven)) * usd);
                    try{
                        //calculate percentile
                        var rank = i + indexInBatch + 1; //Rank 1 has the most stars
                        var top = parseInt((rank / users.length) * 100);
                        console.log(user.name+" TOP:"+top+'%');
                        var percentile = parseInt((users.length - rank + 1) / users.length * 100);
                        if(top < 1){
                            top = 1;
                        }
                        if(top > 99){
                            top = 99;
                        }
                        // if(user.identityVerified){
                        //     user.stars += 50; //give monthly allotment
                        // }
                        if(top <= 10 && user.starsGiven > 0){
                            await User.updateOne({_id: user._id.toString()}, 
                              {
                                $set: {
                                  percentile: percentile,
                                  top: top,
                                  rank: rank,
                                  //TODO: check if theyve been blacklisted as a moderator before
                                  moderator: true
                                }
                              }
                            );
                            //give free subscription tier 1
                            //...
                        }
                        await User.updateOne({_id: user._id.toString()}, 
                          {
                            $set: {
                              percentile: percentile,
                              top: top,
                              rank: rank
                            }
                          }
                        );
                        console.log(user.name+': '+user.top+'%');
                        var test = await User.findOne({_id:user._id});
                        console.log(test.name+': '+test.top+'%');
                        // if(user.amountEarnedThisYear + (userUSD/100) > 600){
                        //     userUSD = 600 - user.amountEarnedThisYear;
                        // }
                        // const cut = (userUSD*0.55);
                        const cut = 0;
                        const transferAmount = Math.floor(userUSD - cut);
                        //only do payout for more than one cent and for verified onboarded members
                        if(transferAmount >= 1 && user.identityVerified == true && user.stripeOnboardingComplete == true){
                            // Generate idempotency key
                            const idempotencyKey = generateIdempotencyKey(
                                user._id,
                                'transfer',
                                rewardPeriod // Use reward period for true idempotency
                            );

                            // Rate limiting
                            await rateLimiter.wait();

                            const transfer = await withRetry(
                                () => stripe.transfers.create({
                                    amount: transferAmount,
                                    currency: "usd",
                                    destination: user.stripeAccountId,
                                }, {
                                    idempotencyKey: idempotencyKey,
                                }),
                                `transfer for user ${user._id}`
                            );
                            
                            // Manually trigger payout for the connected account
                            try {
                                const payoutIdempotencyKey = generateIdempotencyKey(
                                    user._id,
                                    'payout',
                                    rewardPeriod
                                );
                                
                                const payout = await withRetry(
                                    () => stripe.payouts.create({
                                        amount: transferAmount,
                                        currency: "usd",
                                    }, {
                                        stripeAccount: user.stripeAccountId,
                                        idempotencyKey: payoutIdempotencyKey,
                                    }),
                                    `payout for user ${user._id}`
                                );
                                
                                console.log(`Payout initiated for user ${user._id}: ${payout.id}`);
                            } catch (payoutError) {
                                console.error(`Failed to create payout for user ${user._id}:`, payoutError);
                                // Continue even if payout fails - the transfer succeeded
                            }
                            
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
                        }
                        else{
                            // shouldContinue = false;
                        }

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
            rewardPeriod
        );

        try {
            await System.updateOne({}, {$set:{
                userAmount: 0
            }});
            // const payout = await withRetry(
            //     () => stripe.payouts.create({
            //         amount: Math.floor(totalCut),
            //         currency: 'usd',
            //     }, {
            //         idempotencyKey: payoutIdempotencyKey,
            //     }),
            //     'platform payout'
            // );
            // await job.log(`Platform payout created: ${payout.id}, amount: ${totalCut}`);
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
    const rewardPeriod = getRewardPeriod();
    const timestamp = Date.now().toString();
    const jobId = `reward-distribution-${rewardPeriod}`;
    
    const job = await rewardQueue.add({
        jobId: jobId,
        timestamp: timestamp,
        rewardPeriod: rewardPeriod,
    }, {
        priority: 1,
        attempts: 3,
        jobId: jobId, // Prevents duplicate jobs for same period
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