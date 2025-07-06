var cron = require('node-cron');
const { User } = require('../models/User');
const passageService = require('../services/passageService');

//run daily
const job = cron.schedule('0 0 * * *', async () => {
    await passageService.scheduleBackgroundFeedUpdates();
});

module.exports = job;