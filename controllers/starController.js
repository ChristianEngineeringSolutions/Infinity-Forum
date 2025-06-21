'use strict';

const mongoose = require('mongoose');
const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const { Star } = require('../models/Star');
const { System } = require('../models/System');
const { Message } = require('../models/Message');
const starService = require('../services/starService');
const passageService = require('../services/passageService');
const { getRecursiveSourceList, fillUsedInListSingle, getLastSource } = require('./passageController');
const { passageSimilarity, overlaps } = require('../utils/stringUtils');

async function starPassage(req, res){
    var passage_id = req.body.passage_id;
    var user = req.session.user;
    var amount = Number(req.body.amount);
    //get user from db
    let sessionUser = await User.findOne({_id: user._id});
    var subPassage = req.body.parent == 'root' ? false : true;
    if(req.session.user && user){
        if((sessionUser.stars + sessionUser.borrowedStars + sessionUser.donationStars) >= amount && process.env.REMOTE == 'true'){
            console.log("Before star passage");
            let passage = await starService.starPassage(req, amount, req.body.passage_id, sessionUser._id, true);
            if(typeof passage === 'object' && passage !== null){
                passage = await passageService.getPassage(passage);
            }
            else{
                return res.send(passage);
            }
            passage.location = await returnPassageLocation(passage);
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else if(process.env.REMOTE == 'false'){
            console.log("TESTING");
            let passage = await starService.starPassage(req, amount, req.body.passage_id, sessionUser._id, true);
            await sessionUser.save();
            if(typeof passage === 'object' && passage !== null){
                passage = await passageService.getPassage(passage);
            }
            else{
                return res.send(passage);
            }
            passage.location = await returnPassageLocation(passage);
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else{
            return res.send("Not enough stars!");
        }
    }
}

async function starSources(passage, top, authors=[], starredPassages=[], amount, req, _session){
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
                if(sourceAuthor._id.toString() != req.session.user._id.toString() 
                    && sourceAuthor._id.toString() != passage.author._id.toString()
                    && !sourcePop.collaborators.toString().includes(passage.author._id.toString()
                    && !overlaps(sourcePop.collaborators, passage.collaborators))
                    /*&& !authors.includes(sourceAuthor._id)*/){
                    bonus = passageSimilarity(top, sourcePop);
                    bonus = 0; //bonuses are to reward users for citing
                    sourcePop.stars += amount + bonus;
                    //dont give author stars if starrer is a collaborator
                    if(!sourcePop.collaborators.includes(req.session.user._id.toString())){
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
                    if(!sourcePop.collaborators.includes(req.session.user._id.toString())){
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
                await starSources(sourcePop, passage, authors, starredPassages, amount, req, _session);
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

async function singlestarService.StarPassage(req, passage, reverse=false, isSub=false, initialSession=null){
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
            var user = req.session.user._id.toString();
            var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
            var shouldGetContributionPoints = true;
            //if a collaborator
            if(req.session.user._id.toString() == passage.author._id.toString()
                || passage.collaborators.toString().includes(req.session.user._id.toString())){
                shouldGetContributionPoints = false;
            }
            //check if starred already
            var recordSingle = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:false}).session(_session);
            var recordSingleSystem = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:true}).session(_session);
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
                    //check if starred before by starService.starPassage
                    var starredBefore = await Star.findOne({user: req.session.user._id.toString(), passage: passage._id, fromSingle: true}).session(_session);
                    //star each source recursively
                    //if user is verified and numVerifiedStars > lastCap give the passage a user star
                    if(req.session.user.identityVerified && !starredBefore/*(passage.verifiedStars + 1) > passage.lastCap*/
                    && shouldGetContributionPoints){
                        // Call starService.starPassage without starting a new transaction since we're already in one
                        let starResult = await starService.starPassage(req, 1, passage._id, req.session.user._id.toString(), true, true, _session);
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
                        user: req.session.user._id,
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
                        await singlestarService.StarPassage(req, p, false, true, _session);
                    }
                }
            }
            else{
                if(passage.starrers.includes(user)){
                    // recordSingle = await Star.findOne({user: user._id, passage:passage, single:true, system:false});
                    //unstar if no previous record of being directly starred or isnt a sub passage
                    if((recordSingle == null && recordSingleSystem != null) || !isSub){
                        var record = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:false}).session(_session);
                        await singleStarSources(user, sources, passage, true, false, _session);
                        passage.stars -= 1;
                        if(req.session.user.identityVerified){
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
                            await singlestarService.StarPassage(req, p, true, true, _session);
                        }
                    }
                }
            }
            passage.markModified("starrers");
            await passage.save({session: _session});
            passage = await passageService.getPassage(passage);
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
        
        console.log("singlestarService.StarPassage transaction result:", passageResult);
        return passageResult;
    } catch (err) {
        console.error('Transaction failed in singlestarService.StarPassage:', err);
        return null; // Return null instead of throwing error for consistency
    } finally {
        if (shouldEndSession) {
            _session.endSession();
        }
    }
}

module.exports = {
    starService.starPassage,
    starSources,
    singlestarService.StarPassage,
    singleStarSources
};