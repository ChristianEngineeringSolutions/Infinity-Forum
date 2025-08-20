'use strict';

const Redlock = require('redlock').default;
const crypto = require('crypto');
const mongoose = require('mongoose');
const { getRedisClient, getStarQueue } = require('../config/redis');
const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const Star = require('../models/Star');
const Reward = require('../models/Reward');
const System = require('../models/System');
const Message = require('../models/Message');
const Team = require('../models/Team');
const starService = require('./starService');
const { getRecursiveSourceList, fillUsedInListSingle, getLastSource, getPassage, getAllContributors, inTeam, isTeamLeader } = require('./passageService');
const { passageSimilarity, overlaps } = require('../utils/stringUtils');

// Helper function to calculate star addition deltas based on borrowed stars
function calculateStarAddition(currentUser, amount) {
    const deltas = {stars: 0, borrowedStars: 0, donationStars: 0, starsGiven: 0};
    
    if(currentUser.borrowedStars > 0){
        deltas.borrowedStars = -Math.min(currentUser.borrowedStars, amount);
        const remainder = amount + deltas.borrowedStars; // amount left after reducing borrowed
        if(remainder > 0){
            deltas.stars = remainder;
        }
    }else{
        deltas.stars = amount;
    }
    
    return deltas;
}

// Helper function to calculate star depletion deltas
function calculateStarDepletion(currentUser, amount) {
    const deltas = {stars: 0, borrowedStars: 0, donationStars: 0, starsGiven: 0};
    let remainder = amount;
    
    // First, spend borrowed stars
    if(currentUser.borrowedStars > 0){
        const borrowedUsed = Math.min(currentUser.borrowedStars, remainder);
        deltas.borrowedStars = -borrowedUsed;
        remainder -= borrowedUsed;
    }
    
    // If there's still remainder, spend from user.stars or donationStars
    if(remainder > 0){
        if(currentUser.stars > 0){
            // Take from user.stars first (can go to 0 or negative)
            const starsUsed = Math.min(currentUser.stars, remainder);
            deltas.stars = -starsUsed;
            remainder -= starsUsed;
            
            // If still remainder and user.stars is now 0, take from donationStars
            if(remainder > 0 && currentUser.donationStars > 0){
                const donationUsed = Math.min(currentUser.donationStars, remainder);
                deltas.donationStars = -donationUsed;
                remainder -= donationUsed;
            }
            
            // Any final remainder goes to user.stars (making it negative)
            if(remainder > 0){
                deltas.stars -= remainder;
            }
        } else {
            // user.stars is 0 or negative, take from donationStars first
            if(currentUser.donationStars > 0){
                const donationUsed = Math.min(currentUser.donationStars, remainder);
                deltas.donationStars = -donationUsed;
                remainder -= donationUsed;
            }
            
            // Any remainder after donation stars should be taken from user.stars
            if(remainder > 0){
                deltas.stars = -remainder;
            }
        }
    }
    
    return deltas;
}

// StarOperationAccumulator class for batching database operations
class StarOperationAccumulator {
    constructor() {
        this.userStarUpdates = new Map(); // userId -> {stars: 0, borrowedStars: 0, donationStars: 0, starsGiven: 0}
        this.passageStarUpdates = new Map(); // passageId -> {stars: 0, verifiedStars: 0}
        this.starDocuments = []; // Star documents to create
        this.debtUpdates = new Map(); // starId -> newDebtValue
        this.messageStarUpdates = new Map(); // messageId -> starDelta
        this.rewardDocuments = []; // Reward documents to create
        this.rewardDeletions = []; // Reward IDs to delete
        this.passageFieldUpdates = new Map(); // passageId -> {field: value} for other updates
        this.starrerUpdates = new Map(); // passageId -> {add: [userIds], remove: [userIds]}
        this.starDeletions = []; // Star document deletions {user, passage, single}
        this.userLedgerUpdates = new Map(); //userId -> {stars: 0, points: 0, team: team}
    }
    
    addUserStars(userId, updates) {
        const current = this.userStarUpdates.get(userId) || {stars: 0, borrowedStars: 0, donationStars: 0, starsGiven: 0};
        if (typeof updates === 'number') {
            // Legacy support for just star amount - should not be used
            throw new Error('Use calculateStarAddition() to get proper deltas before calling addUserStars');
        } else {
            // New format with specific fields
            current.stars += updates.stars || 0;
            current.borrowedStars += updates.borrowedStars || 0;
            current.donationStars += updates.donationStars || 0;
            current.starsGiven += updates.starsGiven || 0;
        }
        this.userStarUpdates.set(userId, current);
    }

    addUserTeamStars(userId, updates, team) {
        const current = this.userLedgerUpdates.get(userId) || {stars: 0, points: 0, team: team};
        if (typeof updates === 'number') {
            // Legacy support for just star amount - should not be used
            throw new Error('Use calculateStarAddition() to get proper deltas before calling addUserStars');
        } else {
            // New format with specific fields
            current.stars += updates.stars || 0;
            current.points += updates.points || 0;
            current.team = team;

        }
        this.userLedgerUpdates.set(userId, current);
    }
    
    addPassageStars(passageId, stars) {
        const current = this.passageStarUpdates.get(passageId) || {stars: 0, verifiedStars: 0};
        current.stars += stars;
        current.verifiedStars += stars;
        this.passageStarUpdates.set(passageId, current);
    }
    
    addStarDocument(starDoc) {
        this.starDocuments.push(starDoc);
    }
    
    addMessageStars(messageId, stars) {
        const current = this.messageStarUpdates.get(messageId) || 0;
        this.messageStarUpdates.set(messageId, current + stars);
    }
    
    updatePassageField(passageId, field, value) {
        const current = this.passageFieldUpdates.get(passageId) || {};
        current[field] = value;
        this.passageFieldUpdates.set(passageId, current);
    }
    
    addStarrer(passageId, userId) {
        const current = this.starrerUpdates.get(passageId) || {add: [], remove: []};
        if (!current.add.includes(userId)) {
            current.add.push(userId);
        }
        // Remove from remove list if present
        current.remove = current.remove.filter(id => id !== userId);
        this.starrerUpdates.set(passageId, current);
    }
    
    removeStarrer(passageId, userId) {
        const current = this.starrerUpdates.get(passageId) || {add: [], remove: []};
        if (!current.remove.includes(userId)) {
            current.remove.push(userId);
        }
        // Remove from add list if present
        current.add = current.add.filter(id => id !== userId);
        this.starrerUpdates.set(passageId, current);
    }
    
    addStarDeletion(user, passage, single = true) {
        this.starDeletions.push({user, passage, single});
    }
    
    async executeBulkOperations(session) {
        const operations = [];
        
        // User bulk operations
        if (this.userStarUpdates.size > 0) {
            const userBulkOps = Array.from(this.userStarUpdates.entries()).map(([userId, deltas]) => {
                const updateObj = {};
                if (deltas.stars !== 0) updateObj.stars = deltas.stars;
                if (deltas.borrowedStars !== 0) updateObj.borrowedStars = deltas.borrowedStars;
                if (deltas.donationStars !== 0) updateObj.donationStars = deltas.donationStars;
                if (deltas.starsGiven !== 0) updateObj.starsGiven = deltas.starsGiven;
                
                return {
                    updateOne: {
                        filter: { _id: userId },
                        update: { $inc: updateObj }
                    }
                };
            });
            operations.push(User.bulkWrite(userBulkOps, {session}));
        }

        // Team ledger bulk operations
        if (this.userLedgerUpdates.size > 0) {
            const teamBulkOps = Array.from(this.userLedgerUpdates.entries()).map(([userId, deltas]) => {
                const updateObj = {};
                // Update stars and points for specific user in team.ledger array
                if (deltas.stars !== 0) updateObj['ledger.$.stars'] = deltas.stars;
                if (deltas.points !== 0) updateObj['ledger.$.points'] = deltas.points;
                
                return {
                    updateOne: {
                        filter: { 
                            _id: deltas.team._id,
                            'ledger.user': userId
                        },
                        update: { $inc: updateObj }
                    }
                };
            });
            operations.push(Team.bulkWrite(teamBulkOps, {session}));
        }
        
        // Passage bulk operations
        if (this.passageStarUpdates.size > 0 || this.passageFieldUpdates.size > 0) {
            const passageBulkOps = [];
            
            // Star updates
            for (const [passageId, deltas] of this.passageStarUpdates.entries()) {
                const updateObj = {
                    $inc: { stars: deltas.stars, verifiedStars: deltas.verifiedStars }
                };
                
                // Check if there are field updates for this passage
                const fieldUpdates = this.passageFieldUpdates.get(passageId);
                if (fieldUpdates) {
                    updateObj.$set = fieldUpdates;
                    this.passageFieldUpdates.delete(passageId);
                }
                
                passageBulkOps.push({
                    updateOne: {
                        filter: { _id: passageId },
                        update: updateObj
                    }
                });
            }
            
            // Remaining field updates (passages without star updates)
            for (const [passageId, fieldUpdates] of this.passageFieldUpdates.entries()) {
                passageBulkOps.push({
                    updateOne: {
                        filter: { _id: passageId },
                        update: { $set: fieldUpdates }
                    }
                });
            }
            
            if (passageBulkOps.length > 0) {
                operations.push(Passage.bulkWrite(passageBulkOps, {session}));
            }
        }
        
        // Message bulk operations
        if (this.messageStarUpdates.size > 0) {
            const messageBulkOps = Array.from(this.messageStarUpdates.entries()).map(([messageId, stars]) => ({
                updateOne: {
                    filter: { _id: messageId },
                    update: { $inc: { stars } }
                }
            }));
            operations.push(Message.bulkWrite(messageBulkOps, {session}));
        }
        
        // Star document insertions
        if (this.starDocuments.length > 0) {
            operations.push(Star.insertMany(this.starDocuments, {session}));
        }
        
        // Reward operations
        if (this.rewardDocuments.length > 0) {
            operations.push(Reward.insertMany(this.rewardDocuments, {session}));
        }
        
        if (this.rewardDeletions.length > 0) {
            operations.push(Reward.deleteMany({_id: {$in: this.rewardDeletions}}, {session}));
        }
        
        // Starrer updates
        if (this.starrerUpdates.size > 0) {
            const starrerBulkOps = [];
            for (const [passageId, updates] of this.starrerUpdates.entries()) {
                const updateObj = {};
                if (updates.add.length > 0) {
                    updateObj.$addToSet = { starrers: { $each: updates.add } };
                }
                if (updates.remove.length > 0) {
                    updateObj.$pull = { starrers: { $in: updates.remove } };
                }
                if (Object.keys(updateObj).length > 0) {
                    starrerBulkOps.push({
                        updateOne: {
                            filter: { _id: passageId },
                            update: updateObj
                        }
                    });
                }
            }
            if (starrerBulkOps.length > 0) {
                operations.push(Passage.bulkWrite(starrerBulkOps, {session}));
            }
        }
        
        // Star deletions
        if (this.starDeletions.length > 0) {
            const deleteFilters = this.starDeletions.map(del => ({
                user: del.user,
                passage: del.passage,
                single: del.single
            }));
            operations.push(Star.deleteMany({ $or: deleteFilters }, {session}));
        }
        
        // Execute all operations in parallel
        if (operations.length > 0) {
            await Promise.all(operations);
        }
    }
    
    reset() {
        this.userStarUpdates.clear();
        this.passageStarUpdates.clear();
        this.starDocuments = [];
        this.debtUpdates.clear();
        this.messageStarUpdates.clear();
        this.rewardDocuments = [];
        this.rewardDeletions = [];
        this.passageFieldUpdates.clear();
        this.starrerUpdates.clear();
        this.starDeletions = [];
    }
}

// Initialize Redlock for distributed locking
let redlock;
let starQueue;

// Check if Redlock should be enabled (default to false for single Redis instance)
const ENABLE_REDLOCK = process.env.ENABLE_REDLOCK === 'true';

function initializeRedlock() {
    const redisClient = getRedisClient();
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    
    redlock = new Redlock(
        [redisClient],
        {
            // The expected clock drift; for more details see:
            // http://redis.io/topics/distlock
            driftFactor: 0.01, // multiplied by lock ttl to determine drift time
            
            // The max number of times Redlock will attempt to lock a resource
            retryCount: 10,
            
            // The time in ms between attempts
            retryDelay: 200, // time in ms
            
            // The max time in ms randomly added to retries
            retryJitter: 200, // time in ms
            
            // For single Redis instance, we need to adjust the settings
            // Set automaticExtensionThreshold to 0 to disable automatic extension
            automaticExtensionThreshold: 0,
            
            // For single instance, we only need 1 server to agree (quorum of 1)
            // Redlock v5 doesn't have a direct quorum setting, but we can work around it
        }
    );
    
    redlock.on('error', (error) => {
        // Ignore cases where a resource is explicitly unlocked
        if (error.name === 'LockError') {
            console.log('Lock error (might be normal):', error.message);
        } else {
            console.error('Redlock error:', error);
        }
    });
    
    return redlock;
}

// Generate idempotency key for star operations
function generateStarIdempotencyKey(userId, passageId, amount, operation = 'star') {
    // Use a combination of user, passage, amount, and operation type
    // This ensures the same star operation won't be processed twice
    return crypto.createHash('sha256')
        .update(`${userId}-${passageId}-${amount}-${operation}`)
        .digest('hex');
}

// Check if a star operation has already been processed
async function hasStarOperationBeenProcessed(idempotencyKey) {
    const redisOps = require('../config/redis').getRedisOps();
    const result = await redisOps.get(`star:processed:${idempotencyKey}`);
    return result !== null;
}

// Mark a star operation as processed
async function markStarOperationProcessed(idempotencyKey, result) {
    const redisOps = require('../config/redis').getRedisOps();
    // Store for 30 days
    await redisOps.set(`star:processed:${idempotencyKey}`, JSON.stringify({
        processedAt: new Date().toISOString(),
        result: result
    }), { EX: 30 * 24 * 60 * 60 });
}

// Process star queue jobs with distributed locking
async function processStarQueue() {
    console.log('processStarQueue called!');
    console.log('Redlock enabled:', ENABLE_REDLOCK);
    
    if (ENABLE_REDLOCK && !redlock) {
        redlock = initializeRedlock();
    }
    
    starQueue = getStarQueue();
    if (!starQueue) {
        console.error('Star queue not initialized');
        return;
    }
    
    console.log('Setting up star queue processor...');
    console.log('Star queue exists:', !!starQueue);
    console.log('Star queue name:', starQueue.name);
    
    // Process jobs sequentially with concurrency of 1
    console.log('About to call starQueue.process()');
    
    // Add a handler to check when jobs become active
    starQueue.on('active', (job) => {
        console.log(`Job ${job.id} is now active (from event handler)`);
    });
    
    const processor = starQueue.process(1, async (job) => {
        console.log('★★★ Job processor function called! ★★★');
        console.log('Job ID:', job.id);
        console.log('Job data:', JSON.stringify(job.data, null, 2));
        
        const { id: jobId, data } = job;
        const { userId, passageId, amount, sessionUserId, deplete, single, operation, idempotencyKey, team } = data;
        
        console.log(`Processing star job ${jobId} with idempotency key ${idempotencyKey}`);
        
        let lock;
        
        try {
            // Conditionally acquire distributed lock
            console.log('ENABLE_REDLOCK value:', ENABLE_REDLOCK, 'type:', typeof ENABLE_REDLOCK);
            
            if (ENABLE_REDLOCK) {
                const lockKey = `star:lock:${passageId}`;
                const lockTTL = 60000; // 60 seconds
                
                try {
                    lock = await redlock.acquire([lockKey], lockTTL);
                    console.log(`Acquired Redlock for passage ${passageId}`);
                } catch (lockError) {
                    console.error('Failed to acquire Redlock:', lockError.message);
                    throw lockError;
                }
            } else {
                console.log(`Processing passage ${passageId} without Redlock (single instance mode)`);
            }
            
            // Check idempotency
            console.log('Checking idempotency for key:', idempotencyKey);
            const alreadyProcessed = await hasStarOperationBeenProcessed(idempotencyKey);
            console.log('Already processed?', alreadyProcessed);
            
            if (alreadyProcessed) {
                console.log(`Star operation ${idempotencyKey} already processed, skipping`);
                await job.progress(100);
                return { status: 'already_processed', idempotencyKey };
            }
            
            // Process the star operation based on type
            let result;
            if (operation === 'star') {
                result = await processStarPassage(userId, passageId, amount, sessionUserId, deplete, single, team);
            } else if (operation === 'singleStar') {
                result = await processSingleStarPassage(sessionUserId, passageId, data.reverse, data.isSub, team);
            } else {
                throw new Error(`Unknown operation type: ${operation}`);
            }
            
            // Mark as processed
            await markStarOperationProcessed(idempotencyKey, result);
            
            await job.progress(100);
            return { status: 'completed', result, idempotencyKey };
            
        } catch (error) {
            console.error(`Error processing star job ${jobId}:`, error);
            throw error;
        } finally {
            // Always release the lock
            if (lock) {
                try {
                    await lock.release();
                    console.log(`Released lock for passage ${passageId}`);
                } catch (unlockError) {
                    console.error('Error releasing lock:', unlockError);
                }
            }
        }
    });
    
    // Add event handlers for debugging (remove duplicate active handler)
    starQueue.on('error', (error) => {
        console.error('Star queue error:', error);
    });
    
    starQueue.on('failed', (job, err) => {
        console.error(`Job ${job.id} failed:`, err);
    });
    
    starQueue.on('stalled', (job) => {
        console.warn(`Job ${job.id} stalled`);
    });
    
    starQueue.on('completed', (job, result) => {
        console.log(`Job ${job.id} completed:`, result);
    });
    
    starQueue.on('waiting', (jobId) => {
        console.log(`Job ${jobId} is waiting`);
    });
    
    console.log('Star queue processor started');
}

// Helper function to check if author/collaborators should receive contribution points
function shouldGetContributionPoints(sessionUser, passage) {
    return !(sessionUser._id.toString() == passage.author._id.toString() || 
             passage.collaborators.toString().includes(sessionUser._id.toString()));
}

// Helper function to check if author should be rewarded
function shouldRewardAuthor(passage, sessionUser) {
    return sessionUser._id.toString() != passage.author._id.toString() &&
           !passage.collaborators.toString().includes(sessionUser._id.toString());
}

// Process rebates in batch
async function processRebatesBatch(passages, amount, sessionUser, accumulator, session) {
    // Fetch all star logs for all passages in one query
    const passageIds = passages.map(p => p._id);
    const starLogs = await Star.find({
        passage: { $in: passageIds },
        single: false
    }).session(session);
    
    // Group by passage for easier processing
    const logsByPassage = new Map();
    for (const log of starLogs) {
        const passageId = log.passage.toString();
        if (!logsByPassage.has(passageId)) {
            logsByPassage.set(passageId, []);
        }
        logsByPassage.get(passageId).push(log);
    }
    
    // Calculate rebates for each passage
    for (const passage of passages) {
        const logs = logsByPassage.get(passage._id.toString()) || [];
        for (const log of logs) {
            if (log.user.toString() !== sessionUser._id.toString()) {
                const rebateAmount = 0.01 * log.amount * amount;
                const user = await User.findById(log.user).session(session);
                if (user) {
                    const deltas = calculateStarAddition(user, rebateAmount);
                    accumulator.addUserStars(log.user.toString(), deltas);
                }
            }
        }
    }
}

// Process sources in batches with limited transactions
async function processSourcesBatched(rootPassage, amount, sessionUser, deplete, team=false, whichStarsToUse='general') {
    const BATCH_SIZE = 100;
    const processedSources = new Set();
    const sourceQueue = [];
    var authors = [];
    var sources = await getRecursiveSourceList(rootPassage.sourceList, [], rootPassage);
    // Initialize with root passage sources
    for (const source of sources) {
        if (!processedSources.has(source._id.toString())) {
            sourceQueue.push(source._id);
        }
    }
    
    processedSources.add(rootPassage._id.toString());
    
    while (sourceQueue.length > 0) {
        // Take next batch
        const batchIds = sourceQueue.splice(0, BATCH_SIZE);
        
        // Process batch in new transaction
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const accumulator = new StarOperationAccumulator();
                
                // Fetch all passages in batch with necessary populates
                const passages = await Passage.find({
                    _id: { $in: batchIds }
                })
                .populate('author sourceList collaborators')
                .session(session);
                
                // Fetch all users needed for this batch
                const userIds = new Set();
                for (const passage of passages) {
                    userIds.add(passage.author._id.toString());
                    for (const collab of passage.collaborators) {
                        userIds.add(collab._id ? collab._id.toString() : collab.toString());
                    }
                }
                const users = await User.find({ _id: { $in: Array.from(userIds) } }).session(session);
                const userMap = new Map(users.map(u => [u._id.toString(), u]));
                
                // Process each passage
                for (const passage of passages) {
                    if (processedSources.has(passage._id.toString())) continue;
                    //don't restar top passage
                    if(passage._id.toString() === rootPassage._id.toString()) continue;
                    
                    //only star if the same team as rootPassage
                    if(team){
                        if(team._id.toString() !== passage.team._id.toString()){
                            continue;
                        }
                    }
                    // Add stars to passage
                    // You won't get extra stars for citing your own work
                    var passageAuthor = passage.author._id.toString();
                    //the only rewards inChain passages get is passage stars
                    var inChain = rootPassage.chain.toString().includes(passage._id.toString());
                    if((passageAuthor !== sessionUser._id.toString()
                        && passageAuthor !== rootPassage.author._id.toString()
                        && !overlaps(passage.collaborators, rootPassage.collaborators))
                        || inChain){
                        accumulator.addPassageStars(passage._id, amount);
                    }
                    
                    // Process messages for this passage
                    const messages = await Message.find({passage: passage._id}).session(session);
                    for (const message of messages) {
                        accumulator.addMessageStars(message._id, amount);
                    }
                    
                    // Process author and collaborators
                    if (shouldRewardAuthor(passage, sessionUser) && 
                        !overlaps(passage.collaborators, rootPassage.collaborators)
                        && !inChain
                        && !authors.toString().includes(passage.author._id.toString())) {
                        
                        const authorAmount = amount / (passage.collaborators.length + 1);
                        const author = userMap.get(passage.author._id.toString());
                        if (author) {
                            if(whichStarsToUse === 'general'){
                                const deltas = calculateStarAddition(author, authorAmount);
                                accumulator.addUserStars(author._id.toString(), deltas);
                            }else{
                                accumulator.addUserTeamStars(author._id.toString(), {stars: authorAmount}, team);
                            }
                            authors.push(author);
                        }
                    }
                    if(!passage.collaborators.includes(sessionUser._id.toString())
                        && !inChain
                        && !authors.toString().includes(passage.author._id.toString())){
                        // Process collaborators
                        for (const collab of passage.collaborators) {
                            const collabId = collab._id ? collab._id.toString() : collab.toString();
                            const collabUser = userMap.get(collabId);
                            if (collabUser && !authors.toString().includes(collabId) && collabId !== rootPassage.author._id.toString()) {
                                if(whichStarsToUse === 'general'){
                                    const deltas = calculateStarAddition(collabUser, authorAmount);
                                    accumulator.addUserStars(collabId, deltas);
                                }else{
                                    accumulator.addUserTeamStars(collabId, {stars: authorAmount}, team);
                                }
                                authors.push(collabId);
                            }
                        }
                    }
                    
                    // Add unprocessed sources to queue
                    for (const source of passage.sourceList) {
                        if (!processedSources.has(source._id.toString())) {
                            sourceQueue.push(source._id);
                        }
                    }
                    
                    processedSources.add(passage._id.toString());
                }
                
                // Process rebates for this batch
                if(!inChain){
                    await processRebatesBatch(passages, amount, sessionUser, accumulator, session);
                }
                
                // Execute all operations for this batch
                await accumulator.executeBulkOperations(session);
            });
        } finally {
            await session.endSession();
        }
    }
}

// Process starPassage logic - refactored for batch processing
async function processStarPassage(userId, passageId, amount, sessionUserId, deplete, single, team=false) {
    console.log('processStarPassage called with:', { userId, passageId, amount, sessionUserId, deplete, single });
    
    // Validation
    if(isNaN(amount) || amount == 0){
        throw new Error('Please enter a number greater than 0.');
    }
    
    // Get session user first (outside transaction for validation)
    const sessionUser = await User.findOne({_id: sessionUserId});
    if (!sessionUser) {
        throw new Error('Session user not found');
    }
    if(sessionUser.phone === '' && !sessionUser.identityVerified){
        throw new Error('Must be verified to star.');
    }
    
    let starsTakenAway = 0;
    let amountForRebate = amount;
    let passage = null;
    let sources = [];
    let result = null;
    var team;
    var whichStarsToUse;
    
    // TRANSACTION 1: Process main passage only
    const mainSession = await mongoose.startSession();
    try {
        await mainSession.withTransaction(async () => {
            const accumulator = new StarOperationAccumulator();
            
            // Get user and passage
            const user = await User.findOne({_id: userId}).session(mainSession);
            passage = await Passage.findOne({_id: passageId})
                .populate('author sourceList collaborators team')
                .session(mainSession);
            team = passage.team;
            if(team === null){
                team = false;
            }
            var ledger = false;
            if (!user || !passage) {
                throw new Error('User or passage not found');
            }
            
            const contributionPoints = shouldGetContributionPoints(sessionUser, passage);
            
            // Handle star depletion
            if(team){
                if(passage.teamRootPassage && !passage.teamOpen && !inTeam(user, team) && !isTeamLeader(user, team)){
                    throw new Error("This is not an open team; you must be a member to star it.");
                }
                if(!passage.teamRootPassage && !inTeam(user, team) && !isTeamLeader(user, team)){
                    throw new Error("You must be in the team to star it.");
                }
                ledger = team.ledger.filter(function(obj){
                    return obj.user._id.toString() === user._id.toString()
                });
                if(ledger.length === 0 || passage.teamRootPassage){
                    team = false;
                    ledger = false;
                }else{
                    ledger = ledger[0];
                    if(ledger.stars < amount && !single && !ledger.options.useGeneralStars && team.leader._id.toString() !== user._id.toString()){
                        throw new Error("Not enough stars.");
                    }
                }
            }
            whichStarsToUse = !team ? 'general' : (ledger.options.useGeneralStars ? 'general' : 'team');
            if(deplete){
                // Check if user has enough total stars (skip check if single)
                if(((user.stars + user.borrowedStars + user.donationStars) < amount) 
                    && !single 
                    && (!team || (ledger && ledger.options.useGeneralStars))){
                    throw new Error("Not enough stars.");
                }
                else if(team && ledger && !ledger.options.useGeneralStars && team.leader._id.toString() !== user._id.toString()){
                    if(ledger.stars < amount){
                        throw new Error("Not enough stars.");
                    }
                }
                if(whichStarsToUse === 'general'){
                    const depletion = calculateStarDepletion(user, amount);
                    //remove stars from starrer
                    accumulator.addUserStars(userId, depletion);
                    
                    // Track stars taken for contribution points
                    starsTakenAway = Math.abs(depletion.stars);
                    amountForRebate = amount + depletion.donationStars; // Reduce rebate by donation stars used
                }else{
                    accumulator.addUserTeamStars(userId, {stars: -amount}, team);
                    starsTakenAway = amount;
                }
            }
            
            // Get sources for star log
            sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            
            // Process rebates for main passage
            if(!team){
                await processRebatesBatch([passage], amountForRebate, sessionUser, accumulator, mainSession);
            }
            
            var bonus = 0; // bonus logic removed/simplified
            
            // Log the amount starred
            let loggedStarDebt = sessionUser._id.toString() == passage.author._id.toString() ? 0 : (amount + bonus);
            var usersThatOwe = [passage.author, ...passage.collaborators];
            usersThatOwe = usersThatOwe.map(function(collaber){
                if(collaber._id){
                    return collaber._id.toString();
                }
                return collaber.toString();
            });
            accumulator.addStarDocument({
                user: userId,
                passage: passage._id,
                passageAuthor: passage.author._id.toString(),
                usersThatOwe: usersThatOwe,
                amount: amount,
                sources: sources,
                single: false,
                debt: loggedStarDebt,
                fromSingle: single,
                system: null,
                team: !!team
            });
            
            // Add stars to passage
            accumulator.addPassageStars(passage._id, amount + bonus);
            accumulator.updatePassageField(passage._id, 'lastCap', passage.verifiedStars + amount + bonus);
            
            // Handle bubbling passages
            if(passage.bubbling && passage.passages && !passage.public){
                for(const p of passage.passages){
                    // Queue sub-passage starring instead of direct recursion
                    const subIdempotencyKey = generateStarIdempotencyKey(userId, p._id, amount, 'star-bubble');
                    await queueStarOperation({
                        userId,
                        passageId: p._id,
                        amount,
                        sessionUserId,
                        deplete: false,
                        single,
                        operation: 'star',
                        idempotencyKey: subIdempotencyKey,
                        team: team
                    });
                }
            }
            
            // Process star messages
            const messages = await Message.find({passage: passage._id}).session(mainSession);
            for(const message of messages){
                accumulator.addMessageStars(message._id, amount);
            }
            
            // Process collaborator debt
            await processCollaboratorDebtNew(passage, sessionUser, amount, bonus, contributionPoints, accumulator, mainSession, whichStarsToUse);
            
            // Process contribution points
            if(contributionPoints && deplete && starsTakenAway > 0){
                // Calculate absorbed amount from debt processing
                const totalAbsorbed = await calculateTotalAbsorbed(sessionUser, passage, amount, bonus, mainSession, whichStarsToUse);
                var totalPoints;
                if(whichStarsToUse === 'general'){
                    const SYSTEM = await System.findOne({}).session(mainSession);
                    if (!SYSTEM) {
                        throw new Error('System document not found.');
                    }
                    totalPoints = SYSTEM.totalStarsGiven;
                }else{
                    totalPoints = team.totalPoints;
                }
                var numContributionPoints = starsTakenAway;
                
                if(whichStarsToUse === 'general'){
                    var dockingAmount = 
                    ((user.starsGiven+starsTakenAway) * totalAbsorbed) / 
                    (totalPoints + starsTakenAway - user.starsGiven);
                    numContributionPoints -= dockingAmount;
                    accumulator.addUserStars(userId, { starsGiven: numContributionPoints });
                    // Update system total
                    await System.updateOne({}, { $inc: { totalStarsGiven: numContributionPoints }}, {session: mainSession});
                }else{
                    var dockingAmount = 
                    ((user.starsGiven+starsTakenAway) * totalAbsorbed) / 
                    (totalPoints + starsTakenAway - ledger.points);
                    numContributionPoints -= dockingAmount;
                    accumulator.addUserTeamStars(userId, {points: numContributionPoints}, team);
                    // Update system total
                    await Team.updateOne({_id:team._id}, { $inc: { totalPoints: numContributionPoints }}, {session: mainSession});
                }
            }
            
            // Process first place updates
            await processFirstPlaceUpdates(passage, accumulator, mainSession, team);
            
            // Give stars to author and collaborators of main passage
            var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
            if(!contributionPoints){
                amountToGiveCollabers = 0;
            }
            
            if(amountToGiveCollabers > 0){
                // Author
                const authorUser = await User.findById(passage.author._id).session(mainSession);
                if(authorUser){
                    if(whichStarsToUse === 'general'){
                        const authorDeltas = calculateStarAddition(authorUser, amountToGiveCollabers);
                        accumulator.addUserStars(passage.author._id.toString(), authorDeltas);
                    }else{
                        accumulator.addUserTeamStars(passage.author._id.toString(), {stars: amountToGiveCollabers}, team);
                    }
                }
                
                // Collaborators
                for(const collaborator of passage.collaborators){
                    const collabId = collaborator._id ? collaborator._id.toString() : collaborator.toString();
                    if(collabId !== passage.author._id.toString()){
                        const collabUser = await User.findById(collabId).session(mainSession);
                        if(collabUser){
                            if(whichStarsToUse === 'general'){
                                const collabDeltas = calculateStarAddition(collabUser, amountToGiveCollabers);
                                accumulator.addUserStars(collabId, collabDeltas);
                            }else{
                                accumulator.addUserTeamStars(collabId, {stars: amountToGiveCollabers}, team);
                            }
                        }
                    }
                }
            }
            
            // Execute all operations for main passage
            await accumulator.executeBulkOperations(mainSession);
            
            result = await fillUsedInListSingle(passage);
        });
    } finally {
        await mainSession.endSession();
    }
    
    // TRANSACTION 2+: Process sources in batches (separate transactions)
    if(passage){
        await processSourcesBatched(passage, amount, sessionUser, deplete, team, whichStarsToUse);
    }
    
    return result;
}

// Helper function to process collaborator debt
async function processCollaboratorDebt(passage, sessionUser, amount, bonus, contributionPoints, accumulator, session, whichStarsToUse='general'){
    var team = false;
    if(whichStarsToUse === 'team'){
        team = true
    }
    //get all debt that this user owes
    var starrerDebt = await Star.find({
        passageAuthor: sessionUser._id.toString(),
        single: false,
        debt: {$gt:0},
        team: team
    }).session(session);
    
    var allCollaborators = [passage.author, ...passage.collaborators];
    var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
    if(!contributionPoints){
        amountToGiveCollabers = 0;
    }
    
    const debtUpdates = [];
    const inheritedDebts = [];
    
    for(const collaber of allCollaborators){
        // Only process debt if we are actually starring the collaber
        if(passage.author._id.toString() != sessionUser._id.toString() && 
           !passage.collaborators.toString().includes(sessionUser._id.toString())){
            
            // Get all debt owed by session user to specific collaber
            var stars = await Star.find({
                passageAuthor: sessionUser._id.toString(),
                user: collaber._id ? collaber._id.toString() : collaber.toString(),
                single: false,
                debt: {$gt:0},
                team: team
            }).session(session);
            
            for(const star of stars){
                // Filter out processed debt
                // filter out debt that has already been inherited
                starrerDebt = starrerDebt.filter(x => x.trackToken != star.trackToken);
                
                const debtReduction = (amount + bonus)/(passage.collaborators.length + 1);
                const newDebt = Math.max(0, star.debt - debtReduction);
                
                debtUpdates.push({
                    updateOne: {
                        filter: { _id: star._id },
                        update: { $set: { debt: newDebt } }
                    }
                });
                
                if(newDebt === 0) break; // No more debt to process
            }
            
            // Inherit debt
            //each collaber inherits debt of starrer
            for(const debt of starrerDebt){
                inheritedDebts.push({
                    passageAuthor: collaber._id ? collaber._id.toString() : collaber.toString(),
                    user: debt.user._id.toString(),
                    single: false,
                    debt: debt.debt,
                    system: null,
                    passage: passage._id,
                    sources: await getRecursiveSourceList(passage.sourceList, [], passage),
                    trackToken: debt.trackToken,
                    team: !!team
                });
            }
        }
    }
    
    // Execute debt updates
    if(debtUpdates.length > 0){
        await Star.bulkWrite(debtUpdates, {session});
    }
    
    // Create inherited debts
    if(inheritedDebts.length > 0){
        await Star.insertMany(inheritedDebts, {session});
    }
}

// Updated collaborator debt function to share inherited debt
async function processCollaboratorDebtNew(passage, sessionUser, amount, bonus, contributionPoints, accumulator, session, whichStarsToUse='general'){
    var team = false;
    if(whichStarsToUse === 'team'){
        team = true
    }
    //get all debt that this user owes to anyone
    //will be inherited
    var starrerDebt = await Star.find({
        usersThatOwe: {$in:[sessionUser._id.toString()]},
        single: false,
        debt: {$gt:0},
        team: team
    }).session(session);
    
    var allCollaborators = [passage.author, ...passage.collaborators];
    var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
    if(!contributionPoints){
        amountToGiveCollabers = 0;
    }
    
    const debtUpdates = [];
    var inheritBulkOps = [];

    for(const collaber of allCollaborators){
        // Only process debt if we are actually starring the collaber
        if(passage.author._id.toString() != sessionUser._id.toString() && 
           !passage.collaborators.toString().includes(sessionUser._id.toString())){
            
            // Get all debt owed by session user to specific collaber
            var stars = await Star.find({
                usersThatOwe: {$in:[sessionUser._id.toString()]},
                user: collaber._id ? collaber._id.toString() : collaber.toString(),
                single: false,
                debt: {$gt:0},
                team: team
            }).session(session);
            
            //
            for(const star of stars){
                // Filter out processed debt
                starrerDebt = starrerDebt.filter(x => x.trackToken != star.trackToken);
                
                const debtReduction = (amount + bonus)/(passage.collaborators.length + 1);
                const newDebt = Math.max(0, star.debt - debtReduction);
                
                debtUpdates.push({
                    updateOne: {
                        filter: { _id: star._id },
                        update: { $set: { debt: newDebt } }
                    }
                });
                
                if(newDebt === 0) break; // No more debt to process
            }
            
            // Inherit debt
            for(const debt of starrerDebt){
                inheritBulkOps.push({
                    updateOne: {
                        filter: {_id: debt._id, team: !!team},
                        update: {$push:{
                            usersThatOwe: collaber._id ? collaber._id.toString() : collaber.toString()
                        }}
                    }
                });
            }
        }
    }
    
    // Execute debt updates
    if(debtUpdates.length > 0){
        await Star.bulkWrite(debtUpdates, {session});
    }
    if(inheritBulkOps.length > 0){
        await Star.bulkWrite(inheritBulkOps, {session});
    }
}

// Helper function to calculate total absorbed from debt
async function calculateTotalAbsorbed(sessionUser, passage, amount, bonus, session, whichStarsToUse){
    var team = false;
    if(whichStarsToUse === 'team'){
        team = true
    }
    let totalAbsorbed = 0;
    const allCollaborators = [passage.author, ...passage.collaborators];
    
    for(const collaber of allCollaborators){
        if(passage.author._id.toString() != sessionUser._id.toString() && 
           !passage.collaborators.toString().includes(sessionUser._id.toString())){
            
            const stars = await Star.find({
                // passageAuthor: sessionUser._id.toString(), //commented out for processCollaboratorDebtNew to work
                usersThatOwe: {$in:[sessionUser._id.toString()]}, //comment out for processCollaboratorDebt to work, uncomment above
                user: collaber._id ? collaber._id.toString() : collaber.toString(),
                single: false,
                debt: {$gt:0},
                team: team
            }).session(session);
            
            for(const star of stars){
                totalAbsorbed += Math.min(star.debt, (amount + bonus)/(passage.collaborators.length + 1));
            }
        }
    }
    
    return totalAbsorbed;
}

// Helper function to process first place updates
async function processFirstPlaceUpdates(passage, accumulator, session, team=false){
    if(!passage.parent) return;
    
    const oldFirstPlace = await Passage.findOne({
        parent: passage.parent._id.toString(), 
        comment: false, 
        inFirstPlace: true
    }).session(session);
    
    const newFirstPlaceArray = await Passage.find({
        parent: passage.parent._id.toString(), 
        comment: false
    }).sort('-stars').populate('parent author').limit(1).session(session);
    
    const newFirstPlace = newFirstPlaceArray[0];
    if(!newFirstPlace) return;
    
    // Update inFirstPlace field if needed
    if(passage._id.toString() === newFirstPlace._id.toString() && !passage.inFirstPlace){
        accumulator.updatePassageField(passage._id.toString(), 'inFirstPlace', true);
    }
    
    if(!oldFirstPlace || oldFirstPlace._id.toString() === newFirstPlace._id.toString()){
        // No change in first place
        return;
    }
    
    // Get contributors for reward updates
    const sourceList = await getRecursiveSourceList(newFirstPlace.sourceList, [], newFirstPlace);
    const allContributors = getAllContributors(newFirstPlace, sourceList);
    
    if(!oldFirstPlace){
        // First time getting first place
        accumulator.updatePassageField(newFirstPlace._id.toString(), 'inFirstPlace', true);
        accumulator.rewardDocuments.push({
            user: newFirstPlace.author._id.toString(),
            passage: newFirstPlace._id.toString(),
            parentPassage: newFirstPlace.parent._id.toString(),
            selectedAnswer: false
        });
        
        // Add reward to contributors
        if(newFirstPlace.parent && newFirstPlace.parent.reward > 0){
            for(const contributor of allContributors){
                if(!team){
                    accumulator.addUserStars(contributor, { starsGiven: newFirstPlace.parent.reward });
                }else{
                    accumulator.addUserTeamStars(contributor, {points: newFirstPlace.parent.reward}, team);
                }
            }
        }
    } else {
        // Change in first place
        accumulator.updatePassageField(oldFirstPlace._id.toString(), 'inFirstPlace', false);
        accumulator.updatePassageField(newFirstPlace._id.toString(), 'inFirstPlace', true);
        
        // Remove old reward
        const oldReward = await Reward.findOne({
            parentPassage: newFirstPlace.parent._id.toString(), 
            selectedAnswer: false
        }).session(session);
        
        if(oldReward){
            accumulator.rewardDeletions.push(oldReward._id);
            
            // Remove points from old winners
            if(newFirstPlace.parent && newFirstPlace.parent.reward > 0){
                for(const contributor of allContributors){
                    if(!team){
                        accumulator.addUserStars(contributor, { starsGiven: -newFirstPlace.parent.reward });
                    }else{
                        accumulator.addUserTeamStars(contributor, {points: -newFirstPlace.parent.reward}, team);
                    }
                }
            }
        }
        
        // Create new reward
        accumulator.rewardDocuments.push({
            user: newFirstPlace.author._id.toString(),
            passage: newFirstPlace._id.toString(),
            parentPassage: newFirstPlace.parent._id.toString(),
            selectedAnswer: false
        });
        
        // Add points to new winners
        if(newFirstPlace.parent && newFirstPlace.parent.reward > 0){
            for(const contributor of allContributors){
                if(!team){
                    accumulator.addUserStars(contributor, { starsGiven: newFirstPlace.parent.reward });
                }else{
                    accumulator.addUserTeamStars(contributor, {points: newFirstPlace.parent.reward}, team);
                }
            }
        }
    }
}

// Helper function to add stars to user
async function addStarsToUser(user, amount, session){
    if(user.borrowedStars > 0){
        user.borrowedStars -= amount;
        var remainder = user.borrowedStars;
        if(remainder < 0){
            user.stars -= remainder;
        }
        if(user.borrowedStars < 0){
            user.borrowedStars = 0;
        }
    }else{
        user.stars += amount;
    }
    await user.save({session: session});
}

// Helper function for star messages
async function starMessages(passageId, stars, session) {
    var messages = await Message.find({passage: passageId}).session(session);
    for(const message of messages){
        message.stars += stars;
        await message.save({session});
    }
}

// Process star sources recursively
async function processStarSources(passage, top, authors, starredPassages, amount, sessionUser, session) {
    var i = 0;
    var bonus;
    
    for(const source of passage.sourceList){
        var sourcePop = await Passage.findOne({_id:source._id}).populate('author users sourceList').session(session);
        
        // Don't restar top passage
        if(sourcePop._id.toString() !== top._id.toString()){
            // Skip if this source is the same as the current passage to prevent circular citations
            if(sourcePop._id.toString() === passage._id.toString()){
                continue;
            }
            
            // Don't star same passage twice
            if(!starredPassages.toString().includes(sourcePop._id.toString())){
                await starMessages(sourcePop._id, amount, session);
                
                let sourceAuthor = await User.findOne({_id: sourcePop.author._id}).session(session);
                
                //the only rewards inChain passages get is passage stars
                var inChain = passage.chain.toString().includes(sourcePop._id.toString());
                // You won't get extra stars for citing your own work
                // Also give author stars once per author
                if((sourceAuthor._id.toString() != sessionUser._id.toString() 
                    && sourceAuthor._id.toString() != passage.author._id.toString()
                    && !sourcePop.collaborators.toString().includes(passage.author._id.toString())
                    && !overlaps(sourcePop.collaborators, passage.collaborators))
                    || inChain){
                    
                    // bonus = passageSimilarity(top, sourcePop);
                    bonus = 0; // Bonuses are to reward users for citing
                    sourcePop.stars += amount + bonus;
                    //the source just got more stars so let's now reward all 
                    //previous starrers of this source
                    if(!inChain){
                        var loggedStars = await Star.find({passage:sourcePop._id.toString(), single: false})
                        .populate('user passage')
                        .session(session);
                        for(const loggedStar of loggedStars){
                            var starrer = loggedStar.user;
                            //you don't get the rebate when you star
                            if(sessionUser._id.toString() != starrer._id.toString()){
                                totalForStarrer = 0.01 * loggedStar.amount * amount;
                                console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                            }
                            await addStarsToUser(starrer, totalForStarrer, session);
                        }
                    }
                    // Don't give author stars if starrer is a collaborator or author
                    if(!sourcePop.collaborators.toString().includes(sessionUser._id.toString())
                        && !inChain){
                        //or if the author has already gotten stars from this star
                        if(!authors.toString().includes(sourceAuthor._id.toString())){
                            await addStarsToUser(sourceAuthor, (amount + bonus/(sourcePop.collaborators.length + 1)), session);
                        }
                    }
                    
                    authors.push(sourceAuthor._id.toString());
                    for(const collaber of sourcePop.collaborators){
                        authors.push(collaber._id.toString());
                    }
                    await sourcePop.save({session});


                    
                    // Don't give collaborators stars if starrer is a collaborator
                    if(!sourcePop.collaborators.includes(sessionUser._id.toString()) && !inChain){
                        // Give stars to collaborators if applicable
                        // Split stars with collaborators
                        if(sourcePop.collaborators.length > 0){
                            for(const collaborator of sourcePop.collaborators){
                                if(collaborator._id && collaborator._id.toString() == passage.author._id.toString()){
                                    // We already starred the author
                                    continue;
                                }
                                let collaber = await User.findOne({_id:collaborator._id ? collaborator._id.toString() : collaborator.toString()}).session(session);
                                if(collaber != null){
                                    await addStarsToUser(collaber, ((amount + bonus)/(sourcePop.collaborators.length + 1)), session);
                                }
                            }
                        }   
                    }
                }
                starredPassages.push(sourcePop._id.toString());
            }
            
            // Recursive call - but in queue context, we should queue sub-operations instead
            if(sourcePop._id.toString() !== top._id.toString()){
                // For queue-based processing, we should queue this instead of direct recursion
                // But within a transaction, we can still do direct recursion
                await processStarSources(sourcePop, passage, authors, starredPassages, amount, sessionUser, session);
            }else{
                console.log("circular citation detected");
            }
            ++i;
        }
    }
}

// Process single star passage
async function processSingleStarPassage(sessionUserId, passageId, reverse, isSub, team=false) {
    const session = await mongoose.startSession();
    
    let result = null;
    let sourcesOperation = null;
    let sources = [];
    let passage = null;
    let user = null;
    
    try {
        await session.withTransaction(async () => {
            const sessionUser = await User.findOne({_id: sessionUserId}).session(session);
            if (!sessionUser) {
                throw new Error('Session user not found');
            }
            if(sessionUser.phone === '' && !sessionUser.identityVerified){
                throw new Error('Must be verified to star.');
            }
            passage = await Passage.findOne({_id: passageId})
                .populate('author sourceList collaborators team')
                .session(session);
                
            var team = passage.team;
            if(team === null){
                team = false;
            }
            var ledger = false;
            if(team){
                if(!passage.teamRootPassage && !inTeam(sessionUser, team) && !isTeamLeader(sessionUser, team)){
                    throw new Error("You must be in the team to star it.");
                }
                ledger = team.ledger.filter(function(obj){
                    return obj.user._id.toString() === user._id.toString()
                });
                ledger = ledger[0];
                if(ledger.stars < amount && !single && !ledger.options.useGeneralStars && team.leader._id.toString() !== user._id.toString()){
                    throw new Error("Not enough stars.");
                }
            }
            if (!passage) {
                throw new Error('Passage not found');
            }
            
            user = sessionUser._id.toString();
            sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            var shouldGetContributionPoints = true;
            
            // If a collaborator
            if(sessionUser._id.toString() == passage.author._id.toString()
                || passage.collaborators.toString().includes(sessionUser._id.toString())){
                shouldGetContributionPoints = false;
            }
            
            // Check if starred already
            var recordSingle = await Star.findOne({user: sessionUser._id, passage:passage._id, single:true, system:false}).session(session);
            var recordSingleSystem = await Star.findOne({user: sessionUser._id, passage:passage._id, single:true, system:true}).session(session);
            
            if(!reverse){
                // Star mirror best and bestof and repost
                // and add to sources
                if(passage.showBestOf){
                    var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).session(session);
                    if(best != null){
                        sources.push(best);
                    }
                }
                else{
                    try{
                        var mirror = await Passage.findOne({_id:passage.mirror._id})
                            .populate('parent author users sourceList collaborators versions subforums')
                            .session(session);
                        if(mirror != null)
                            sources.push(mirror);
                    }
                    catch(e){
                    }
                    try{
                        var bestOf = await Passage.findOne({parent:passage.bestOf._id})
                            .sort('-stars')
                            .populate('parent author users sourceList collaborators versions subforums')
                            .session(session);
                        if(bestOf != null)
                            sources.push(bestOf);
                    }
                    catch(e){
                    }
                }
                
                // Star if hasn't been starred already
                if((recordSingleSystem == null && recordSingle == null) || !isSub){
                    var system = isSub ? true : false;
                    
                    // Check if starred before by starPassage
                    var starredBefore = await Star.findOne({user: sessionUser._id.toString(), passage: passage._id, fromSingle: true}).session(session);
                    
                    // Star each source recursively
                    // If user is verified and numVerifiedStars > lastCap give the passage a user star
                    if(sessionUser.identityVerified && !starredBefore && shouldGetContributionPoints){
                        // Queue a regular star operation instead of direct call
                        const subIdempotencyKey = generateStarIdempotencyKey(sessionUserId, passageId, 1, 'singlestar-verified');
                        await queueStarOperation({
                            userId: sessionUserId,
                            passageId: passageId,
                            amount: 1,
                            sessionUserId: sessionUserId,
                            deplete: true,
                            single: true,
                            operation: 'star',
                            idempotencyKey: subIdempotencyKey
                        });
                        
                        // Mark that sources need to be processed after transaction
                        sourcesOperation = {reverse: false, justRecord: true};
                    }
                    else if(sessionUser.identityVerified && !starredBefore){
                        //just add a star to passage but not collabers
                        passage.stars += 1;
                        if(!team){
                            let userDoc = await User.findOne({_id:user}).session(session);
                            userDoc.stars -= 1;
                            await userDoc.save(session);
                        }
                        else{
                            await Team.updateOne(
                                {
                                    _id: team._id,
                                    'ledger.user': user._id.toString()
                                },
                                {
                                    $inc: {
                                        'ledger.$.stars': -1
                                    }
                                }, {session: session});
                        }
                        // Mark that sources need to be processed after transaction
                        sourcesOperation = {reverse: false, justRecord: false};
                    }
                    else{
                        // Just add a star to passage but not collaborators
                        passage.stars += 1;
                        // Mark that sources need to be processed after transaction
                        sourcesOperation = {reverse: false, justRecord: false};
                    }
                    
                    // Check if passage is valid before accessing starrers
                    if(passage && passage.starrers){
                        passage.starrers.push(user);
                    } else {
                        console.error("Passage or passage.starrers is null/undefined:", passage);
                        throw new Error("Invalid passage object");
                    }
                    
                    console.log(passage.starrers);
                    var star = await Star.create([{
                        user: sessionUser._id,
                        passage: passage._id,
                        amount: 1,
                        sources: sources,
                        single: true,
                        system: system
                    }], {session: session});
                }
                
                // If bubbling star all sub passages (content is displayed in parent)
                if(passage.bubbling && passage.passages && !passage.public){
                    for(const p of passage.passages){
                        // Queue sub-passage single star operations
                        const subIdempotencyKey = generateStarIdempotencyKey(sessionUserId, p._id, 1, 'singlestar-bubble');
                        await queueStarOperation({
                            sessionUserId: sessionUserId,
                            passageId: p._id,
                            reverse: false,
                            isSub: true,
                            operation: 'singleStar',
                            idempotencyKey: subIdempotencyKey
                        });
                    }
                }
            }
            else{
                // Reverse operation (unstar)
                if(passage.starrers.includes(user)){
                    // Unstar if no previous record of being directly starred or isn't a sub passage
                    if((recordSingle == null && recordSingleSystem != null) || !isSub){
                        // Mark that sources need to be processed after transaction
                        sourcesOperation = {reverse: true, justRecord: false};
                        passage.stars -= 1;
                        if(sessionUser.identityVerified){
                            passage.verifiedStars -= 1;
                        }
                        passage.starrers = passage.starrers.filter(u => {
                            return u != user;
                        });
                        await Star.deleteOne({user: user, passage: passage._id, single: true}).session(session);
                    }
                    
                    // If bubbling unstar all sub passages (content is displayed in parent)
                    if(passage.bubbling && passage.passages && !passage.public){
                        for(const p of passage.passages){
                            // Queue sub-passage single unstar operations
                            const subIdempotencyKey = generateStarIdempotencyKey(sessionUserId, p._id, 1, 'singlestar-reverse-bubble');
                            await queueStarOperation({
                                sessionUserId: sessionUserId,
                                passageId: p._id,
                                reverse: true,
                                isSub: true,
                                operation: 'singleStar',
                                idempotencyKey: subIdempotencyKey
                            });
                        }
                    }
                }
            }
            
            passage.markModified("starrers");
            await passage.save({session: session});
            result = await getPassage(passage);
        });
        
        // Process sources in batches outside the main transaction if needed
        if(sourcesOperation && passage && sources.length > 0){
            await processSingleStarSourcesBatched(
                user, 
                sources, 
                passage, 
                sourcesOperation.reverse, 
                sourcesOperation.justRecord
            );
        }
        
        return result;
        
    } catch (error) {
        console.error('Error in processSingleStarPassage:', error);
        throw error;
    } finally {
        await session.endSession();
    }
}

// Process single star sources in batches
async function processSingleStarSourcesBatched(user, sources, mainPassage, reverse=false, justRecord=false) {
    const BATCH_SIZE = 100;
    const sourceIds = sources.map(s => (s._id || s).toString()).filter(id => id !== mainPassage._id.toString());
    
    while (sourceIds.length > 0) {
        const batchIds = sourceIds.splice(0, BATCH_SIZE);
        
        // Process batch in new transaction
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const accumulator = new StarOperationAccumulator();
                
                // Fetch batch of sources with necessary data
                const batchSources = await Passage.find({
                    _id: { $in: batchIds }
                })
                .populate('author collaborators sourceList')
                .session(session);
                
                for (const source of batchSources) {
                    // Skip if this source is the same as the main passage
                    if(source._id.toString() === mainPassage._id.toString()){
                        continue;
                    }
                    
                    // Check if starred already
                    const recordSingle = await Star.findOne({
                        user: user, 
                        passage: source._id, 
                        single: true, 
                        system: false
                    }).session(session);
                    
                    const recordSingleSystem = await Star.findOne({
                        user: user, 
                        passage: source._id, 
                        single: true, 
                        system: true
                    }).session(session);
                    
                    // Unstar if no previous record of being directly starred
                    if(reverse && recordSingle == null){
                        accumulator.addStarDeletion(user, source._id, true);
                        accumulator.addPassageStars(source._id, -1);
                        accumulator.removeStarrer(source._id, user);
                    }
                    // Star if hasn't been starred already and not a collaborator
                    else if(recordSingleSystem == null && recordSingle == null
                        && source.author._id.toString() != user 
                        && source.author._id.toString() != mainPassage.author._id.toString()
                        && !source.collaborators.toString().includes(mainPassage.author._id.toString())
                        && !overlaps(source.collaborators, mainPassage.collaborators)
                        && !source.collaborators.includes(user)){
                        
                        if(!justRecord){
                            accumulator.addPassageStars(source._id, 1);
                        }
                        accumulator.addStarrer(source._id, user);
                        
                        // Get sources for star log
                        const sourceSources = await getRecursiveSourceList(source.sourceList, [], source);
                        accumulator.addStarDocument({
                            user: user,
                            passage: source._id,
                            amount: 1,
                            sources: sourceSources,
                            single: true,
                            system: true
                        });
                    }
                }
                
                // Execute all operations for this batch
                await accumulator.executeBulkOperations(session);
            });
        } finally {
            await session.endSession();
        }
    }
}

// Process single star sources (legacy - kept for compatibility)
async function processSingleStarSources(user, sources, passage, reverse=false, justRecord=false, session){
    for(const source of sources){
        // Skip if this source is the same as the main passage to avoid version conflicts
        if(source._id && source._id.toString() === passage._id.toString()){
            continue;
        }
        
        // Check if starred already
        var recordSingle = await Star.findOne({user: user, passage:source._id || source, single:true, system:false}).session(session);
        var recordSingleSystem = await Star.findOne({user: user, passage:source._id || source, single:true, system:true}).session(session);
        
        // Unstar if no previous record of being directly starred
        if(reverse && recordSingle == null){
            await Star.deleteOne({user: user, passage: source._id, single: true}).session(session);
            source.stars -= 1;
            source.starrers = source.starrers.filter(u => {
                return u != user;
            });
            await source.save({session: session});
        }
        // Star if hasn't been starred already and not a collaborator
        else if(recordSingleSystem == null && recordSingle == null
            && source.author._id.toString() != user 
            && source.author._id.toString() != passage.author._id.toString()
            && !source.collaborators.toString().includes(passage.author._id.toString())
            && !overlaps(source.collaborators, passage.collaborators)
            && !source.collaborators.includes(user)){
            
            if(!justRecord){
                source.stars += 1;
            }
            source.starrers.push(user);
            
            var sourceSources = await getRecursiveSourceList(source.sourceList, [], source);
            var star = await Star.create([{
                user: user,
                passage: source,
                amount: 1,
                sources: sourceSources,
                single: true,
                system: true
            }], {session: session});
            await source.save({session: session});
        }
    }
}

// Queue a star operation
async function queueStarOperation(data) {
    const starQueue = getStarQueue();
    if (!starQueue) {
        throw new Error('Star queue not initialized');
    }
    
    console.log('Adding job to star queue with data:', data);
    
    const job = await starQueue.add(data, {
        jobId: `star-${data.idempotencyKey}`,
        priority: data.priority || 0,
        delay: data.delay || 0
    });
    
    console.log(`Job added to queue with ID: ${job.id}`);
    
    // Try to get the job immediately to verify it was added
    const addedJob = await starQueue.getJob(job.id);
    console.log('Job retrieved from queue:', !!addedJob);
    if (addedJob) {
        console.log('Job data:', addedJob.data);
        console.log('Job opts:', addedJob.opts);
    }
    
    // Check waiting jobs
    const waitingJobs = await starQueue.getWaiting();
    console.log('Number of waiting jobs:', waitingJobs.length);
    
    return job.id;
}

// Initialize and start the processor
async function startStarQueueProcessor() {
    console.log('startStarQueueProcessor called!');
    try {
        await processStarQueue();
        console.log('Star queue processor initialized successfully');
    } catch (error) {
        console.error('Failed to start star queue processor:', error);
        throw error;
    }
}

// Cleanup old processed keys (run periodically)
async function cleanupOldProcessedKeys(daysToKeep = 30) {
    const redisOps = require('../config/redis').getRedisOps();
    const keys = await redisOps.keys('star:processed:*');
    
    let cleaned = 0;
    for (const key of keys) {
        const data = await redisOps.get(key);
        if (data) {
            const parsed = JSON.parse(data);
            const processedDate = new Date(parsed.processedAt);
            const daysSince = (Date.now() - processedDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSince > daysToKeep) {
                await redisOps.del(key);
                cleaned++;
            }
        }
    }
    
    console.log(`Cleaned up ${cleaned} old star operation keys`);
    return cleaned;
}

module.exports = {
    initializeRedlock,
    processStarQueue,
    startStarQueueProcessor,
    queueStarOperation,
    generateStarIdempotencyKey,
    cleanupOldProcessedKeys
};