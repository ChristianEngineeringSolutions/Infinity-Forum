var cron = require('node-cron');
var {
    queueRewardDistribution,
    getRewardJobStatus,
    cleanupOldJobs,
    rewardQueue,
    } = require('../reward-users');
//run monthly cron
const job = cron.schedule('0 12 1 * *', async () => {
    //reward users
    (async function(){
        // Queue a reward distribution
        const result = await queueRewardDistribution();
        console.log(`Job ID: ${result.jobId}`);

        // Check status
        const status = await getRewardJobStatus(result.jobId);
        console.log(`Status: ${status.state}, Progress: ${status.progress}%`);

        // Clean up old jobs
        await cleanupOldJobs(7); // Remove jobs older than 7 days
    })();
    console.log('Monthly Cron ran at 12pm.');
});

module.exports = job;