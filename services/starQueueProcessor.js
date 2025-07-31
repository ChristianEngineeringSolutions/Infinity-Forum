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
const { getRecursiveSourceList, fillUsedInListSingle, getLastSource, getPassage } = require('./passageService');
const { passageSimilarity, overlaps } = require('../utils/stringUtils');

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
        const { userId, passageId, amount, sessionUserId, deplete, single, operation, idempotencyKey } = data;
        
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
                result = await processStarPassage(userId, passageId, amount, sessionUserId, deplete, single);
            } else if (operation === 'singleStar') {
                result = await processSingleStarPassage(sessionUserId, passageId, data.reverse, data.isSub);
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

// Process starPassage logic (extracted from starService.js)
async function processStarPassage(userId, passageId, amount, sessionUserId, deplete, single) {
    console.log('processStarPassage called with:', { userId, passageId, amount, sessionUserId, deplete, single });
    const session = await mongoose.startSession();
    
    try {
        let result = null;
        
        await session.withTransaction(async () => {
            console.log('Starting transaction...');
            
            // Get session user
            const sessionUser = await User.findOne({_id: sessionUserId}).session(session);
            if (!sessionUser) {
                throw new Error('Session user not found');
            }
            console.log('Session user found:', sessionUser.username);
            
            // The rest of the starPassage logic from starService.js
            let user = await User.findOne({_id: userId}).session(session);
            let passage = await Passage.findOne({_id: passageId}).populate('author sourceList').session(session);
            
            if (!user || !passage) {
                throw new Error('User or passage not found');
            }
            
            var shouldGetContributionPoints = true;
            //if a collaborator
            if(sessionUser._id.toString() == passage.author._id.toString()
                || passage.collaborators.toString().includes(sessionUser._id.toString())){
                shouldGetContributionPoints = false;
            }
            
            if(isNaN(amount) || amount == 0){
                throw new Error('Please enter a number greater than 0.');
            }
            
            var starsTakenAway = 0;
            var amountForRebate = amount;
            
            if(deplete){
                // Check if user has enough total stars (skip check if single)
                if(((user.stars + user.borrowedStars + user.donationStars) < amount) && !single){
                    throw new Error("Not enough stars.");
                }
                
                var remainder = amount;
                
                // First, spend borrowed stars
                if(user.borrowedStars > 0){
                    var borrowedUsed = Math.min(user.borrowedStars, remainder);
                    user.borrowedStars -= borrowedUsed;
                    remainder -= borrowedUsed;
                }
                
                // If there's still remainder, spend from user.stars or donationStars
                if(remainder > 0){
                    if(user.stars > 0){
                        // Take from user.stars first (can go to 0 or negative)
                        var starsUsed = Math.min(user.stars, remainder);
                        user.stars -= starsUsed;
                        starsTakenAway += starsUsed;
                        remainder -= starsUsed;
                        
                        // If still remainder and user.stars is now 0, take from donationStars
                        if(remainder > 0 && user.donationStars > 0){
                            var donationUsed = Math.min(user.donationStars, remainder);
                            user.donationStars -= donationUsed;
                            remainder -= donationUsed;
                            amountForRebate -= donationUsed;
                        }
                        
                        // Any final remainder goes to user.stars (making it negative)
                        if(remainder > 0){
                            user.stars -= remainder;
                            starsTakenAway += remainder;
                        }
                    } else {
                        // user.stars is 0 or negative, take from donationStars first
                        if(user.donationStars > 0){
                            var donationUsed = Math.min(user.donationStars, remainder);
                            user.donationStars -= donationUsed;
                            remainder -= donationUsed;
                            amountForRebate -= donationUsed;
                        }
                        
                        // Any remainder after donation stars should be taken from user.stars
                        if(remainder > 0){
                            user.stars -= remainder;
                            starsTakenAway = remainder;
                        }
                    }
                }
            }
            
            // Process sources and rebates
            var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            
            // Give starring user stars for each logged stars at 1% rate (rebate)
            //removed populating sources since we are no longer doing that
            var loggedStars = await Star.find({passage:passage._id, single: false})
                .populate('user passage')
                .session(session);
                
            var totalForStarrer = 0;
            for(const loggedStar of loggedStars){
                var starrer = loggedStar.user;
                var sourceLog = [];
                //you dont get the rebate when you star
                if(sessionUser._id.toString() != starrer._id.toString()){
                    totalForStarrer = 0.01 * loggedStar.amount * amountForRebate;
                    console.log('root, '+starrer.name + ' made ' + totalForStarrer + ' stars!');
                }
                
                //commented out because this would unfairly advantage starring
                //a passage with many sources
                // for(const source of loggedStar.sources){
                //     if(!sourceLog.includes(source) && 
                //         source.author._id.toString() != starrer._id.toString() && 
                //         sessionUser._id.toString() != starrer._id.toString()){
                //         console.log("working, " + starrer.name);
                //         let subtotal = 0.01 * loggedStar.amount * amountForRebate;
                //         totalForStarrer += subtotal;
                //         console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                //     }
                //     sourceLog.push(source);
                // }
                await addStarsToUser(starrer, totalForStarrer, session);
            }
            
            var lastSource = await getLastSource(passage);
            var bonus = 0;
            bonus = bonus * amount;
            
            // Log the amount starred
            let loggedStarDebt = sessionUser._id.toString() == passage.author._id.toString() ? 0 : (amount + bonus);
            await Star.create([{
                user: userId,
                passage: passage._id,
                passageAuthor: passage.author._id.toString(),
                amount: amount,
                sources: sources,
                single: false,
                debt: loggedStarDebt,
                fromSingle: single,
                system: null
            }], {session: session});
            
            // Add stars to passage
            console.log(`Adding ${amount + bonus} stars to passage. Current stars: ${passage.stars}`);
            passage.stars += amount + bonus;
            passage.verifiedStars += amount + bonus;
            passage.lastCap = passage.verifiedStars;
            console.log(`New star count: ${passage.stars}`);
            
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
                        idempotencyKey: subIdempotencyKey
                    });
                }
            }
            
            // Process star messages
            await starMessages(passage._id, amount, session);
            
            // Process collaborator debt and distribution
            var starrerDebt = await Star.find({
                passageAuthor: sessionUser._id.toString(),
                single: false,
                debt: {$gt:0}
            }).session(session);
            
            // Absorb amount of stars that goes to author and collaborators
            // depending on "star debt"
            var allCollaborators = [passage.author, ...passage.collaborators];
            var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
            if(!shouldGetContributionPoints){
                amountToGiveCollabers = 0;
            }
            var totalAbsorbed = 0;
            
            collaboratorsLoop:
            for(const collaber of allCollaborators){
                // Only inherit debt, subtract debt, and create debt if we are actually starring the collaber
                if(passage.author._id.toString() != sessionUser._id.toString() && !passage.collaborators.includes(sessionUser._id.toString())){
                    // Get all debt owed by session user to specific collaber
                    var stars = await Star.find({
                        passageAuthor: sessionUser._id.toString(), // (owes the debt)
                        user: collaber._id.toString(), // they starred session user
                        single: false,
                        debt: {$gt:0}
                    }).session(session);
                    
                    for(const star of stars){
                        // Filter out all old debt that was already added to this collaber
                        starrerDebt = starrerDebt.filter(function(x){
                            return x.trackToken != star.trackToken;
                        });
                        // Reduce the amount we're giving collabers by the amount owed
                        amountToGiveCollabers -= star.debt;
                        totalAbsorbed += star.debt;
                        star.debt -= (amount + bonus)/(passage.collaborators.length + 1);
                        
                        if(star.debt <= 0){
                            star.debt = 0;
                            await star.save({session});
                            continue;
                        }else{
                            await star.save({session});
                            break collaboratorsLoop;
                        }
                    }
                    
                    // Each collaber inherits star debt from starrer to prevent collusion rings
                    for(const debt of starrerDebt){
                        await Star.create([{
                            passageAuthor: collaber._id.toString(),
                            user: debt.user._id.toString(),
                            single: false,
                            debt: debt.debt,
                            system: null,
                            passage: passage._id,
                            sources: sources,
                            trackToken: debt.trackToken
                        }], {session: session});
                    }
                }
            }
            if(amountToGiveCollabers < 0){
                amountToGiveCollabers = 0;
            }
            // Process contribution points
            if(shouldGetContributionPoints && deplete && starsTakenAway > 0){
                const SYSTEM = await System.findOne({}).session(session);
                if (!SYSTEM) {
                    throw new Error('System document not found.');
                }
                var numContributionPoints = starsTakenAway;
                //reduce the numcontributionpoints by an amount
                //that makes it equal to if they were starring
                //a group of users that didn't star them first
                var dockingAmount = 
                ((user.starsGiven+starsTakenAway) * totalAbsorbed) / 
                (SYSTEM.totalStarsGiven + starsTakenAway - user.starsGiven);
                numContributionPoints -= dockingAmount;
                user.starsGiven += numContributionPoints;
                SYSTEM.totalStarsGiven += amount;
                await SYSTEM.save({session});
            }
            
            // Save all changes
            await user.save({session});
            await passage.save({session});
            //update first place for this 
            if(passage.parent){
                var oldFirstPlace = await Passage.findOne({parent:passage.parent._id.toString(), comment: false, inFirstPlace: true}).session(session);
                var newFirstPlaceArray = await Passage.find({parent:passage.parent._id.toString(), comment: false}).sort('-stars').populate('parent author').limit(1).session(session);
                var newFirstPlace = newFirstPlaceArray[0];
                if(oldFirstPlace._id.toString() !== newFirstPlace._id.toString()){
                    var sourceList = await passageService.getRecursiveSourceList(passage.sourceList, [], passage);
                    var allContributors = passageService.getAllContributors(passage, sourceList);
                }
                if(passage._id.toString() === newFirstPlace._id.toString() && !passage.inFirstPlace){
                    await Passage.updateOne({
                        _id: passage._id.toString()
                    }, {$set: {
                        inFirstPlace: true
                    }}, {session});
                }
                if(oldFirstPlace && newFirstPlace._id.toString() == oldFirstPlace._id.toString()){
                    //no changes needed, still in first place
                }else if(!oldFirstPlace){
                    //first time getting a first place in this thread
                    newFirstPlace.inFirstPlace = true;
                    await newFirstPlace.save(session);
                    await Reward.create({
                        user: newFirstPlace.author._id.toString(),
                        passage: newFirstPlace._id.toString(),
                        parentPassage: newFirstPlace.parent._id.toString(),
                        selectedAnswer: false
                    }, {session});
                    //add points to users who got reward
                    if(newFirstPlace.parent && newFirstPlace.parent.reward > 0){
                        for(const contributor of allContributors){
                            await User.updateOne({_id: contributor}, {
                                $inc: { starsGiven: newFirstPlace.parent.reward }
                            }, {session});
                        }
                    }
                    
                }else{
                    oldFirstPlace.inFirstPlace = false;
                    newFirstPlace.inFirstPlace = true;
                    await oldFirstPlace.save(session);
                    await newFirstPlace.save(session);
                    const oldReward = await Reward.findOne({parentPassage: newFirstPlace.parent._id.toString(), selectedAnswer: false}).session(session);
                    if(oldReward && newFirstPlace.parent && newFirstPlace.parent.reward > 0){
                        //remove points from all old users who got reward
                        for(const contributor of allContributors){
                            await User.updateOne({_id: contributor}, {
                                $inc: { starsGiven: -newFirstPlace.parent.reward }
                            }, {session});
                        }
                    }
                    await Reward.deleteOne({parentPassage: newFirstPlace.parent._id.toString(), selectedAnswer: false}, {session});
                    await Reward.create({
                        user: newFirstPlace.author._id.toString(),
                        passage: newFirstPlace._id.toString(),
                        parentPassage: newFirstPlace.parent._id.toString(),
                        selectedAnswer: false
                    }, {session});
                    //add points to users who got reward
                    if(newFirstPlace.parent && newFirstPlace.parent.reward > 0){
                        for(const contributor of allContributors){
                            await User.updateOne({_id: contributor}, {
                                $inc: { starsGiven: newFirstPlace.parent.reward }
                            }, {session});
                        }
                    }
                }
            }
            await addStarsToUser(passage.author, amountToGiveCollabers, session);
            
            // Give stars to collaborators if applicable
            if(passage.collaborators.length > 0){
                for(const collaborator of passage.collaborators){
                    if(collaborator._id && collaborator._id.toString() == passage.author._id.toString()){
                        // We already starred the author
                        continue;
                    }
                    let collaber = await User.findOne({_id: collaborator._id ? collaborator._id.toString() : collaborator.toString()}).session(session);
                    if(collaber != null){
                        await addStarsToUser(collaber, amountToGiveCollabers, session);
                    }
                }
            }
            
            // Star each source
            var i = 0;
            var authors = [];
            
            // Add sources for best, bestOf, and mirror
            if(passage.showBestOf){
                var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('parent author users sourceList collaborators versions subforums').session(session);
                if(best != null){
                    passage.sourceList.push(best);
                }
            }
            else{
                try{
                    var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums').session(session);
                    if(mirror != null)
                        passage.sourceList.push(mirror);
                }
                catch(e){
                }
                try{
                    var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums').session(session);
                    if(bestOf != null)
                        passage.sourceList.push(bestOf);
                }
                catch(e){
                }
            }
            
            // Process sources
            await processStarSources(passage, passage, [], [], amount, sessionUser, session);
            
            result = await fillUsedInListSingle(passage);
        });
        
        return result;
        
    } catch (error) {
        console.error('Error in processStarPassage:', error);
        throw error;
    } finally {
        await session.endSession();
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
                
                // You won't get extra stars for citing your own work
                // Also give author stars once per author
                if(sourceAuthor._id.toString() != sessionUser._id.toString() 
                    && sourceAuthor._id.toString() != passage.author._id.toString()
                    && !sourcePop.collaborators.toString().includes(passage.author._id.toString())
                    && !overlaps(sourcePop.collaborators, passage.collaborators)){
                    
                    // bonus = passageSimilarity(top, sourcePop);
                    bonus = 0; // Bonuses are to reward users for citing
                    sourcePop.stars += amount + bonus;
                    //the source just got more stars so let's now reward all 
                    //previous starrers of this source
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
                    // Don't give author stars if starrer is a collaborator
                    if(!sourcePop.collaborators.toString().includes(sessionUser._id.toString())){
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
                    if(!sourcePop.collaborators.includes(sessionUser._id.toString())){
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
async function processSingleStarPassage(sessionUserId, passageId, reverse, isSub) {
    const session = await mongoose.startSession();
    
    try {
        let result = null;
        
        await session.withTransaction(async () => {
            const sessionUser = await User.findOne({_id: sessionUserId}).session(session);
            if (!sessionUser) {
                throw new Error('Session user not found');
            }
            
            const passage = await Passage.findOne({_id: passageId})
                .populate('author sourceList collaborators')
                .session(session);
                
            if (!passage) {
                throw new Error('Passage not found');
            }
            
            var user = sessionUser._id.toString();
            var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
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
                        
                        // Process sources
                        await processSingleStarSources(user, sources, passage, false, true, session);
                    }
                    else if(sessionUser.identityVerified && !starredBefore){
                        //just add a star to passage but not collabers
                        passage.stars += 1;
                        let userDoc = await User.findOne({_id:user}).session(session);
                        userDoc.stars -= 1;
                        await userDoc.save(session);
                        await processSingleStarSources(user, sources, passage, false, false, session);
                    }
                    else{
                        // Just add a star to passage but not collaborators
                        passage.stars += 1;
                        await processSingleStarSources(user, sources, passage, false, false, session);
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
                        await processSingleStarSources(user, sources, passage, true, false, session);
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
        
        return result;
        
    } catch (error) {
        console.error('Error in processSingleStarPassage:', error);
        throw error;
    } finally {
        await session.endSession();
    }
}

// Process single star sources
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