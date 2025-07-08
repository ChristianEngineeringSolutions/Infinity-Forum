'use strict';

const mongoose = require('mongoose');
const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const { Star } = require('../models/Star');
const { System } = require('../models/System');
const { Message } = require('../models/Message');
const { getRecursiveSourceList, fillUsedInListSingle, getLastSource } = require('./passageService');
const { getPassage } = require('../services/passageService');
const { passageSimilarity, overlaps } = require('../utils/stringUtils');

async function starMessages(passageId, amount) {
    // This function will be extracted from sasame.js
    // Placeholder for now
    return;
}
async function addStarsToUser(user, amount, _session){
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
    await user.save({session: _session});
}

async function starPassage(sessionUser, amount, passageID, userID, deplete=true, single=false, initialSession=null){
    let _session = initialSession;
    let shouldEndSession = false; // Flag to indicate if THIS call started the session
    if (_session === null) { // Check if a session was not passed in
        _session = await mongoose.startSession(); // Assign to the outer 'let' variable
        shouldEndSession = true; // This instance of starPassage is responsible for ending the session
    }
    try{
        let passageResult = null;
        
        // Define the transaction logic as a separate function
        const transactionLogic = async () => {
            let user = await User.findOne({_id: userID}).session(_session);
            let passage = await Passage.findOne({_id: passageID}).populate('author sourceList').session(_session);
            var shouldGetContributionPoints = true;
            //if a collaborator
            if(sessionUser._id.toString() == passage.author._id.toString()
                || passage.collaborators.toString().includes(sessionUser._id.toString())){
                shouldGetContributionPoints = false;
            }
            if(isNaN(amount) || amount == 0){
                passageResult = 'Please enter a number greater than 0.';
                return;
            }
            var starsTakenAway = 0;
            var amountForRebate = amount;
            if(deplete){
                // Check if user has enough total stars (skip check if single)
                if(((user.stars + user.borrowedStars + user.donationStars) < amount) && !single){
                    passageResult = "Not enough stars.";
                    return passageResult;
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
            var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            //Give starring user stars for each logged stars at 1% rate (rebate)
            var loggedStars = await Star.find({passage:passage._id, single: false}).populate('user passage sources').session(_session);
            var totalForStarrer = 0;
            for(const loggedStar of loggedStars){
                var starrer = loggedStar.user;
                var sourceLog = [];
                if(sessionUser._id.toString() != starrer._id.toString()){
                    totalForStarrer = 0.01 * loggedStar.amount * amountForRebate;
                    console.log('root, '+starrer.name + ' made ' + totalForStarrer + ' stars!');
                }
                // console.log("Logged sources: " + loggedStar.sources);
                for(const source of loggedStar.sources){
                    //if the author of the passage is not the one who did the starring
                    // console.log(source.author._id.toString() != starrer._id.toString());
                    //only give each starrer each source one time &&
                    //a starrer will not get back stars from their own passages &&
                    //you dont get stars back when starring a passage, only when others star it
                    if(!sourceLog.includes(source) && 
                        source.author._id.toString() != starrer._id.toString() && 
                        sessionUser._id.toString() != starrer._id.toString()){
                        console.log("working, " + starrer.name);
                        //give the starrer 1% of each entry
                        let subtotal = 0.01 * loggedStar.amount * amountForRebate;
                        totalForStarrer += subtotal;
                        console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                    }
                    sourceLog.push(source);
                }
                // console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                await addStarsToUser(starrer, totalForStarrer, _session);
            }
            var lastSource = await getLastSource(passage);
            var bonus = 0;
            //calculate bonus
            // for(const source of passage.sourceList){
            //     if(passage.author._id.toString() != source.author._id.toString()){
            //         var similarity = passageSimilarity(passage, source);
            //         bonus += similarity > 0.1 ? similarity : 0;
            //     }
            // }
            bonus = bonus * amount;
            //log the amount starred
            let loggedStarDebt = sessionUser._id.toString() == passage.author._id.toString() ? 0 : (amount + bonus);
            await Star.create([{
                user: userID,
                passage: passage._id,
                passageAuthor: passage.author._id.toString(),
                amount: amount,
                sources: sources,
                single: false,
                debt: loggedStarDebt,
                fromSingle: single,
                system: null //not relevant since we cant unstar these so just make it null
            }], {session: _session}); 
            // if(lastSource != null){
            //     bonus = passageSimilarity(passage, lastSource);
            // }else{
            //     bonus = 0;
            // }
            // if(lastSource && lastSource.author._id.toString() == sessionUser._id.toString()){
            //     bonus = 0;
            // }
            //add stars to passage and sources
            passage.stars += amount + bonus;
            console.log("BONUS:"+bonus);
            passage.verifiedStars += amount + bonus;
            passage.lastCap = passage.verifiedStars;
            //if bubbling star all sub passages (content is displayed in parent)
            if(passage.bubbling && passage.passages && !passage.public){
                for(const p of passage.passages){
                    //also star sources for each sub passage
                    passage.sourceList = [...passage.sourceList, ...p.sourceList];
                    await starPassage(sessionUser, amount, p._id, userID, false, single, _session);
                }
            }
            await starMessages(passage._id, amount);
            //each collaber inherits star debt from starrer (session user)
            var starrerDebt = await Star.find({
                passageAuthor: sessionUser._id.toString(),
                single: false,
                debt: {$gt:0}
            });
            //absorb amount of stars that goes to author and collaborators
            //depending on "star debt"
            //get stars given to the starrer by these collaborators
            var allCollaborators = [passage.author, ...passage.collaborators];
            var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
            if(!shouldGetContributionPoints){
                amountToGiveCollabers = 0;
            }
            collaboratorsLoop:
            for(const collaber of allCollaborators){
                //only inherit debt, subtract debt, and create debt if we are actually starring the collaber
                //you have to star someone elses passage to get stars
                if(passage.author._id.toString() != sessionUser._id.toString() && !passage.collaborators.includes(sessionUser._id.toString())){
                    //get all debt owed by session user to specific collaber
                    var stars  = await Star.find({
                        //they got starred by collaber
                        passageAuthor: sessionUser._id.toString(), //(owes the debt)
                        user: collaber._id.toString(), //they starred session user
                        single: false,
                        debt: {$gt:0}
                    }).session(_session);
                    for(const star of stars){
                        //filter out all old debt that was already added to this collaber in a previous starPassage()
                        //before adding new debt
                        starrerDebt = starrerDebt.filter(function(x){
                            //this item comes from debt already added
                            return x.trackToken != star.trackToken;
                        });
                        //reduce the amount we're giving collabers by the amount owed
                        amountToGiveCollabers -= star.debt;
                        star.debt -= (amount + bonus)/(passage.collaborators.length + 1);
                        if(star.debt <= 0){
                            star.debt = 0;
                            await star.save({_session});
                            //they paid off this debt so continue to the next one
                            continue;
                        }else{
                            //amountToGiveCollaborators should be <= 0
                            await star.save({_session});
                            //they cant pay off their debt so stop
                            //trying to pay it
                            break collaboratorsLoop;
                        }
                    }
                    //each collaber inherits star debt from starrer to prevent collusion rings
                    //this is so that the collaber has to pay off the debt before they can pay the debt.user
                    for(const debt of starrerDebt){
                        //create debt owed by collaber to starrer
                        await Star.create([{
                            passageAuthor: collaber._id.toString(), //owes the debt
                            user: debt.user._id.toString(), //to this user in the circle
                            single: false,
                            debt: debt.debt,
                            system: null,
                            passage: passage._id, //might not need this
                            sources: sources, //might not need this
                            trackToken: debt.trackToken
                        }], {session: _session});
                    }
                }
                if(amountToGiveCollabers < 0){
                    amountToGiveCollabers = 0;
                }
                if(!single && shouldGetContributionPoints){
                    user.starsGiven += starsTakenAway;
                }
                const SYSTEM = await System.findOne({}).session(_session);
                if (!SYSTEM) {
                    throw new Error('System document not found.');
                }
                if(deplete){
                    //only add to starsgiven count if they cant be associated with a user
                    //thus deplete must be true because single stars don't add to starsGiven
                    SYSTEM.totalStarsGiven += amount;
                    await SYSTEM.save({_session});
                }
                // passage.author.stars += amountToGiveCollabers;
                await addStarsToUser(passage.author, amountToGiveCollabers, _session);
                //give stars to collaborators if applicable
                //split stars with collaborators
                if(passage.collaborators.length > 0){
                    for(const collaborator in passage.collaborators){
                        if(collaborator._id.toString() == passage.author._id.toString()){
                            //we already starred the author
                            continue;
                        }
                        let collaber = await User.findOne({_id:collaborator._id.toString()}).session(_session);
                        if(collaber != null){
                            // collaber.stars += amountToGiveCollabers;
                            await addStarsToUser(collaber, amountToGiveCollabers, _session);
                            // await collaber.save();
                        }
                    }
                }
                // await passage.author.save();
            }
            await user.save({_session});
            await passage.save({_session});
            //star each source
            var i = 0;
            var authors = [];
            //add sources for best,bestof,and mirror
            if(passage.showBestOf){
                var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('parent author users sourceList collaborators versions subforums');;
                if(best != null){
                    passage.sourceList.push(best);
                }
            }
            else{
                try{
                    var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums');
                    if(mirror != null)
                    passage.sourceList.push(mirror);
                }
                catch(e){
                }
                try{
                    var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums');
                    if(bestOf != null)
                        passage.sourceList.push(bestOf);
                }
                catch(e){
                }
            }
            //recursively star sources
            await starSources(passage, passage, [], [], amount, sessionUser, _session);
            passageResult = await fillUsedInListSingle(passage); 
        };
        
        // Execute transaction logic - use withTransaction only if we created the session
        if (shouldEndSession) {
            // We created the session, so we need to manage the transaction
            await _session.withTransaction(transactionLogic);
        } else {
            // Session was passed in, so we're already in a transaction
            await transactionLogic();
        }
        
        console.log("starPassage transaction result:", passageResult);
        return passageResult;
    }
    catch(err){
        console.log("starPassage error:", err);
        console.log("err passageID"+passageID);
        console.error('Transaction failed after retries or due to a non-transient error:', err);
        return null; // Return null instead of undefined on error
    }
    finally {
        if (shouldEndSession) { // Only end the session if *this* function call initiated it
            _session.endSession();
        }
    }
}

async function starSources(passage, top, authors=[], starredPassages=[], amount, sessionUser, _session){
    var i = 0;
    var bonus;
    for(const source of passage.sourceList){
        var sourcePop = await Passage.findOne({_id:source._id}).populate('author users sourceList').session(_session);
        //dont restar top passage
        if(sourcePop._id.toString() !== top._id.toString()){
            // Skip if this source is the same as the current passage to prevent circular citations
            if(sourcePop._id.toString() === passage._id.toString()){
                continue;
            }
            //don't star same passage twice
            if(!starredPassages.includes(sourcePop._id.toString())){
                await starMessages(sourcePop._id, amount);
                // console.log(passage.sourceList);
                let sourceAuthor = await User.findOne({_id: sourcePop.author._id}).session(_session);
                //you won't get extra stars for citing your own work
                //also give author stars once per author
                if(sourceAuthor._id.toString() != sessionUser._id.toString() 
                    && sourceAuthor._id.toString() != passage.author._id.toString()
                    && !sourcePop.collaborators.toString().includes(passage.author._id.toString()
                    && !overlaps(sourcePop.collaborators, passage.collaborators))
                    /*&& !authors.includes(sourceAuthor._id)*/){
                    bonus = passageSimilarity(top, sourcePop);
                    bonus = 0; //bonuses are to reward users for citing
                    sourcePop.stars += amount + bonus;
                    //dont give author stars if starrer is a collaborator
                    if(!sourcePop.collaborators.includes(sessionUser._id.toString())){
                        if(!authors.includes(sourceAuthor._id.toString())){
                            await addStarsToUser(sourceAuthor, (amount + bonus/(sourcePop.collaborators.length + 1)), _session);
                        }
                    }
                    authors.push(sourceAuthor._id.toString());
                    for(const collaber of sourcePop.collaborators){
                        authors.push(collaber._id.toString());
                    }
                    await sourcePop.save({_session});
                    //dont give collaborators stars if starrer is a collaborator
                    if(!sourcePop.collaborators.includes(sessionUser._id.toString())){
                        //give stars to collaborators if applicable
                        //split stars with collaborators
                        if(sourcePop.collaborators.length > 0){
                            for(const collaborator in sourcePop.collaborators){
                                if(collaborator._id.toString() == passage.author._id.toString()){
                                    //we already starred the author
                                    continue;
                                }
                                let collaber = await User.findOne({_id:collaborator._id.toString()}).session(_session);
                                if(collaber != null){
                                    await addStarsToUser(collaber, ((amount + bonus)/(sourcePop.collaborators.length + 1)), _session);
                                }
                            }
                        }   
                    }
                }
                starredPassages.push(sourcePop._id.toString());
            }
            if(sourcePop._id.toString() !== top._id.toString()){
                await starSources(sourcePop, passage, authors, starredPassages, amount, sessionUser, _session);
            }else{
                console.log("circular");
            }
            ++i;
        }
    }
}

async function singleStarSources(user, sources, passage, reverse=false, justRecord=false, _session){
    for(const source of sources){
        // Skip if this source is the same as the main passage to avoid version conflicts
        if(source._id.toString() === passage._id.toString()){
            continue;
        }
        //check if starred already
        var recordSingle = await Star.findOne({user: user, passage:source, single:true, system:false}).session(_session);
        var recordSingleSystem = await Star.findOne({user: user, passage:source, single:true, system:true}).session(_session);
        //unstar if no previous record of being directly starred
        if(reverse && recordSingle == null){
            await Star.deleteOne({user: user, passage: source._id, single: true}).session(_session);
            source.stars -= 1;
            source.starrers = source.starrers.filter(u => {
                return u != user;
            });
            await source.save({session: _session});
        }
        //star if hasnt been starred already and not a collaborator
        //you won't get extra stars for citing your own work
        //also give author stars once per author
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
            var sources = await getRecursiveSourceList(source.sourceList, [], source);
            var star = await Star.create([{
                user: user,
                passage: source,
                amount: 1,
                sources: sources,
                single: true,
                system: true
            }], {session: _session});
            await source.save({session: _session});
        }
    }
}

async function singleStarPassage(sessionUser, passage, reverse=false, isSub=false, initialSession=null){
    let _session = initialSession;
    let shouldEndSession = false;
    if (_session === null) {
        _session = await mongoose.startSession();
        shouldEndSession = true;
    }
    
    try {
        let passageResult = null;
        
        // Define the transaction logic as a separate function
        const transactionLogic = async () => {
            var user = sessionUser._id.toString();
            var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            var shouldGetContributionPoints = true;
            //if a collaborator
            if(sessionUser._id.toString() == passage.author._id.toString()
                || passage.collaborators.toString().includes(sessionUser._id.toString())){
                shouldGetContributionPoints = false;
            }
            //check if starred already
            var recordSingle = await Star.findOne({user: sessionUser._id, passage:passage._id, single:true, system:false}).session(_session);
            var recordSingleSystem = await Star.findOne({user: sessionUser._id, passage:passage._id, single:true, system:true}).session(_session);
            if(!reverse){
                //star mirror best and bestof and repost
                //and add to sources
                if(passage.showBestOf){
                    var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).session(_session);
                    if(best != null){
                        sources.push(best);
                    }
                }
                else{
                    try{
                        var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums').session(_session);
                        if(mirror != null)
                        sources.push(mirror);
                    }
                    catch(e){
                    }
                    try{
                        var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums').session(_session);
                        if(bestOf != null)
                            sources.push(bestOf);
                    }
                    catch(e){
                    }
                }
                //star if hasn't been starred already
                if((recordSingleSystem == null && recordSingle == null) || !isSub){
                    var system = isSub ? true : false;
                    //check if starred before by starPassage
                    var starredBefore = await Star.findOne({user: sessionUser._id.toString(), passage: passage._id, fromSingle: true}).session(_session);
                    //star each source recursively
                    //if user is verified and numVerifiedStars > lastCap give the passage a user star
                    if(sessionUser.identityVerified && !starredBefore/*(passage.verifiedStars + 1) > passage.lastCap*/
                    && shouldGetContributionPoints){
                        // Call starPassage without starting a new transaction since we're already in one
                        let starResult = await starPassage(sessionUser, 1, passage._id, sessionUser._id.toString(), true, true, _session);
                        if(starResult && typeof starResult === 'object'){
                            passage = starResult;
                        }
                        //in the future maybe make sure we hard star new sources (TODO)
                        await singleStarSources(user, sources, passage, false, true, _session);
                    }
                    else{
                        //just add a star to passage but not collabers
                        passage.stars += 1;
                        await singleStarSources(user, sources, passage, false, false, _session);
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
                    }], {session: _session});
                }
                //if bubbling star all sub passages (content is displayed in parent)
                if(passage.bubbling && passage.passages && !passage.public){
                    for(const p of passage.passages){
                        //also star sources for each sub passage
                        passage.sourceList = [...passage.sourceList, ...p.sourceList];
                        await singleStarPassage(sessionUser, p, false, true, _session);
                    }
                }
            }
            else{
                if(passage.starrers.includes(user)){
                    // recordSingle = await Star.findOne({user: user._id, passage:passage, single:true, system:false});
                    //unstar if no previous record of being directly starred or isnt a sub passage
                    if((recordSingle == null && recordSingleSystem != null) || !isSub){
                        var record = await Star.findOne({user: sessionUser._id, passage:passage._id, single:true, system:false}).session(_session);
                        await singleStarSources(user, sources, passage, true, false, _session);
                        passage.stars -= 1;
                        if(sessionUser.identityVerified){
                            passage.verifiedStars -= 1;
                        }
                        passage.starrers = passage.starrers.filter(u => {
                            return u != user;
                        });
                        await Star.deleteOne({user: user, passage: passage._id, single: true}).session(_session);
                    }

                    //if bubbling unstar all sub passages (content is displayed in parent)
                    if(passage.bubbling && passage.passages && !passage.public){
                        for(const p of passage.passages){
                            //also star sources for each sub passage
                            passage.sourceList = [...passage.sourceList, ...p.sourceList];
                            await singleStarPassage(sessionUser, p, true, true, _session);
                        }
                    }
                }
            }
            passage.markModified("starrers");
            await passage.save({session: _session});
            passage = await getPassage(passage);
            passageResult = passage;
        };
        
        // Execute transaction logic - use withTransaction only if we created the session
        if (shouldEndSession) {
            // We created the session, so we need to manage the transaction
            await _session.withTransaction(transactionLogic);
        } else {
            // Session was passed in, so we're already in a transaction
            await transactionLogic();
        }
        
        console.log("singleStarPassage transaction result:", passageResult);
        return passageResult;
    } catch (err) {
        console.error('Transaction failed in singleStarPassage:', err);
        return null; // Return null instead of throwing error for consistency
    } finally {
        if (shouldEndSession) {
            _session.endSession();
        }
    }
}

module.exports = {
    addStarsToUser,
    starPassage,
    starSources,
    singleStarPassage,
    singleStarSources
};