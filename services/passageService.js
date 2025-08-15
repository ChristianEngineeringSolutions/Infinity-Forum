const { getRedisClient, getRedisOps, isRedisReady } = require('../config/redis.js');
const { Passage } = require('../models/Passage');
const Visitor = require('../models/Visitor');
const Follower = require('../models/Follower');
const { User } = require('../models/User');
const fileService = require('./fileService');
const { getFeedQueue } = require('../config/redis');
const { DOCS_PER_PAGE, scripts, labelOptions } = require('../common-utils');
const browser = require('browser-detect');
const standardPopulate = 'author users sourceList parent subforums collaborators versions mirror bestOf best';
function updateLabel(passage){
    switch(passage.label){
        case 'Project':
        case 'Idea':
        case 'Database':
        case 'Article':
        case 'Folder':
        case 'Miscellaneous':
            passage.public = false;
            passage.forum = false;
            break;
        case 'Social':
        case 'Question':
        case 'Comment':
        case 'Task':
        case 'Challenge':
        case 'Product':
        case 'Public Folder':
        case 'Commission':
            passage.public = true;
            passage.forum = false;
            break;
        case 'Forum':
            passage.public = true;
            passage.forum = true;
            break;
        default:
            passage.public = false;
            passage.forum = false;
    }
}
async function deletePassage(passage){
    //delete old versions
    await Passage.deleteMany({versionOf: passage});
    //delete uploads too
    for(const filename of passage.filename){
        //make sure no other passages are using the file
        var passages = await Passage.find({
            filename: {
                $in: [filename]
            }
        });
        if(passages.length == 1){
            await fileService.deleteOldUploads(passage);
        }
    }
    var passages = await Passage.find({parent:passage._id});
    for(const p of passages){
        await deletePassage(p);
    }
    await Passage.deleteOne({_id: passage._id});
}
async function copyPassage(passage, user, parent, callback, synthetic=false, comment=false){
    //add source
    let sourceList = passage.sourceList;
    sourceList.push(passage._id);
    if(parent !== null){
        sourceList.push(parent);
    }
    //remove duplicates
    sourceList = Object.values(sourceList.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
    if(passage.showBestOf){
        var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
        copy.best = best;
    }
    //duplicate main passage
    let copy = await Passage.create({
        parent: parent,
        author: user[0],
        users: user,
        sourceList: sourceList,
        title: passage.title,
        content: passage.content,
        html: passage.html,
        css: passage.css,
        javascript: passage.javascript,
        filename: passage.filename,
        code: passage.code,
        lang: passage.lang,
        isSVG: passage.isSVG,
        license: passage.license,
        mimeType: passage.mimeType,
        thumbnail: passage.thumbnail,
        metadata: passage.metadata,
        sourceLink: passage.sourceLink,
        personal: passage.personal,
        synthetic: synthetic,
        mirror: passage.mirror,
        bestOf: passage.bestOf,
        mirrorEntire: passage.mirrorEntire,
        mirrorContent: passage.mirrorContent,
        bestOfEntire: passage.bestOfEntire,
        bestOfContent: passage.bestOfContent,
        comment: comment,
        sourcedFrom: passage._id.toString()
    });
    //Add copy to passage it was duplicated into
    if(parent != "root" && parent != null){
        let parentPassage = await Passage.findOne({_id: parent});
        copy.parent = parentPassage;
        parentPassage.passages.push(copy);
        await copy.save();
        await parentPassage.save();
    }
    //copy children
    async function copyPassagesRecursively(passage, copy){
        let copySubPassages = [];
        //copy children
        if(!passage.public && !passage.forum){
            for(const p of passage.passages){
                let sourceList = p.sourceList;
                sourceList.push(p._id);
                let pcopy = await Passage.create({
                    author: user[0],
                    users: user,
                    parent: copy,
                    sourceList: sourceList,
                    title: p.title,
                    content: p.content,
                    html: p.html,
                    css: p.css,
                    javascript: p.javascript,
                    filename: p.filename,
                    code: p.code,
                    lang: p.lang,
                    isSVG: p.isSVG,
                    license: p.license,
                    mimeType: p.mimeType,
                    thumbnail: p.thumbnail,
                    metadata: p.metadata,
                    sourceLink: p.sourceLink,
                    synthetic: synthetic,
                    personal: p.personal,
                    sourcedFrom: p._id.toString()
                });
                copy.passages.push(pcopy._id);
                await copy.save();
                //copy children's children
                if(p.passages && !p.public && !p.forum){
                    await copyPassagesRecursively(p, pcopy);
                }
            }
        }
        // console.log(copy.title);
        let update = await Passage.findOneAndUpdate({_id: copy._id}, {
            passages: copy.passages
        }, {
            new: true
        });
        let check = await Passage.findOne({_id: copy._id});
        return update;
        // console.log(done.title + '\n' + done.passages[0]);
    }
    let result = '';
    if(passage.passages.length >= 1){
        let result = await copyPassagesRecursively(passage, copy);
    }
    else{
        console.log('false');
    }
    let ret = await Passage.findOne({_id: copy._id}).populate('parent author users sourceList subforums collaborators versions mirror bestOf best');
    return ret;
    // res.render('passage', {passage: copy, sub: true});
}

async function getRecursiveSourceList(sourceList, sources=[], passage, getAuthor=false){
    for(const source of sourceList){
        if(getAuthor){
            var sourcePassage = await Passage.findOne({_id:source}).populate('author collaborators');
        }else{
            var sourcePassage = await Passage.findOne({_id:source});
        }
        //get specials as well
        // sourcePassage = await getPassage(sourcePassage);
        if(sourcePassage != null){
            var special = null;
            // console.log(sourcePassage._id);
            if(sources.some(s => s._id.toString() === sourcePassage._id.toString())){
                continue;
            }
            // Skip if this source is the same as the original passage to prevent circular citations
            if(sourcePassage._id.toString() === passage._id.toString()){
                continue;
            }                
            sources.push(sourcePassage);
            if(source.showBestOf == true){
                special = await Passage.findOne({parent: source._id}, null, {sort: {stars: -1}});
                special = special._id;
            }
            if(source.best != null){
                special = source.best;
            }
            if(source.repost != null){
                special = source.repost;
            }
            if(source.bestOf != null){
                special = source.bestOf;
            }
            if(source.mirror != null){
                special = source.mirror;
            }
            if(special != null){
                if(getAuthor){
                    special = await Passage.findOne({_id:special}).populate('author');
                }else{
                    special = await Passage.findOne({_id:special});
                }
                special = await Passage.findOne({_id:special});
                sources.push(special);
            }
            sources = await getRecursiveSourceList(sourcePassage.sourceList, sources, passage, getAuthor);
        }
    }
    // console.log(sources);
    sources = sources.filter(i => i);
    sources = Object.values(sources.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
    return sources;
}

function getContributors(passage){
    var contributors = [passage.author, ...passage.collaborators];
    for(const source of passage.sourceList){
        contributors.push(source.author, ...source.collaborators);
    }
    return contributors;
}
function getAllContributors(passage, sourceList){
    var contributors = [passage.author, ...passage.collaborators];
    for(const source of sourceList){
        contributors.push(source.author, ...source.collaborators);
    }
    
    // Convert to array of string _ids and remove duplicates
    contributors = contributors
        .filter(c => c) // Remove null/undefined values
        .map(c => c._id ? c._id.toString() : c.toString()) // Convert to string IDs
        .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates
    
    return contributors;
}

async function fillUsedInList(passages){
    if(passages.length > 0)
    for(const passage of passages){
        passage.usedIn = [];
        var ps = await Passage.find({
            sourceList: {
                $in: [passage._id]
            },
            versionOf: null
        });
        for(const p of ps){
            var record = await Passage.findOne({_id: p._id});
            passage.usedIn.push('<a href="/passage/'+record.title+'/'+record._id+'">'+record.title+'</a>');
        }
    }
    return passages;
}

async function fillUsedInListSingle(passage){
    passage.usedIn = [];
    var ps = await Passage.find({
        sourceList: {
            $in: [passage._id]
        },
        versionOf: null
    });
    for(const p of ps){
        var record = await Passage.findOne({_id: p._id});
        passage.usedIn.push('<a href="/passage/'+record.title+'/'+record._id+'">'+record.title+'</a>');
    }
    return passage;
}

async function generateGuestFeed(page = 1, limit = 10) {
    // Unique cache key for guest feed
    const cacheKey = `guest_feed:v1`;
    const CACHE_EXPIRATION = 300; // 5 minutes
    
    let feedIds = null;
    const redisClient = getRedisClient();
    const redis = getRedisOps();
    
    // Try to get from cache if Redis is available
    if (isRedisReady()) {
        console.log("Redis available");
        try {
            const feedCache = await redis.get(cacheKey);
            if (feedCache) {
                console.log('feedcache:'+cacheKey);
                feedIds = JSON.parse(feedCache);
                console.log('feedids cached:'+feedIds?.length);
            }
        } catch (error) {
            console.error('Redis error when getting guest feed cache:', error);
        }
    }
    
    var System = require('../models/System');
    var lastUpdateOnFile = new Date(process.env.LAST_UPDATE || Date.now());
    var SYSTEM = await System.findOne({});
    
    if(!SYSTEM){
        SYSTEM = await System.create({lastUpdate: Date.now()});
    }
    
    if((await System.findOne({lastUpdate: {$exists:true}})) == null){
        SYSTEM.lastUpdate = Date.now();
        await SYSTEM.save();
    }
    
    //if the last manual update was after the last soft update
    if(lastUpdateOnFile > SYSTEM.lastUpdate){
        //generate a new feed
        var pass = true;
        SYSTEM.lastUpdate = lastUpdateOnFile;
        await SYSTEM.save();
        console.log("Updated guest feed");
    }else{
        var pass = false; //show cached feed
    }
    
    console.log('Feedids:'+(feedIds?.length || 'null'));
    // If not in cache or Redis unavailable, generate the feed
    if (!feedIds || pass) {
        console.log('Generating new guest feed');
        
        // Define time windows
        const recentCutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // Last 30 days
        const veryRecentCutoff = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)); // Last 3 days
        
        // Query to efficiently filter passages
        const query = {
            versionOf: null,
            deleted: false,
            personal: false,
            simulated: false,
            forumType: {$in: ['', null]},
            $or: [
                { date: { $gte: veryRecentCutoff } }, // Very recent content
                { stars: { $gte: 0 } }, // Popular content
                { 
                    date: { $gte: recentCutoff },
                    stars: { $gte: 2 } // Recent content with some engagement
                }
            ],
            $or: [
                { content: { $ne: '' } },
                { code: { $ne: '' } }
            ]
        };
        
        // First, just get IDs and minimal data needed for scoring
        const minimalPassages = await Passage.find(query)
            .select('_id author stars date')
            .limit(500);
        
        // Simple scoring algorithm (can be enhanced with more sophisticated logic later)
        const authorAppearances = {};
        const scoredPassages = [];
        
        for (const passage of minimalPassages) {
            const authorId = passage.author._id ? passage.author._id.toString() : passage.author.toString();
            // Count this appearance (start at 0)
            authorAppearances[authorId] = (authorAppearances[authorId] || 0);
            
            // Calculate scores
            const recencyScore = calculateRecencyScore(passage.date);
            const starScore = Math.log10(passage.stars + 1) * 2;
            
            // Apply author diversity penalty - stronger with each appearance
            const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);
            
            // Randomness factor
            const randomnessFactor = 0.7 + (Math.random() * 0.6);
            
            // Calculate final score
            const score = (
                (recencyScore * 0.4) +
                (starScore * 0.6)
            ) * authorDiversityFactor * randomnessFactor;
            
            scoredPassages.push({
                passageId: passage._id,
                score
            });
            
            // Increment author appearance count
            authorAppearances[authorId]++;
        }
        
        // Sort and get IDs
        scoredPassages.sort((a, b) => b.score - a.score);
        feedIds = scoredPassages.map(item => item.passageId.toString());
        
        // Cache the IDs
        if (isRedisReady()) {
            try {
                console.log("Setting cacheKey");
                console.log(feedIds?.length);
                await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', CACHE_EXPIRATION);
            } catch (error) {
                console.error('Redis error when setting guest feed cache:', error);
            }
        }
    }
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    // Double-check it's an array
    if (!Array.isArray(feedIds)) {
        console.error('Generated feedIds is not an array:', feedIds);
        feedIds = [];
    }
    
    const paginatedIds = feedIds.slice(startIndex, endIndex);
    
    // Check pagination bounds
    if (paginatedIds.length === 0 && feedIds.length > 0) {
        const lastValidPage = Math.ceil(feedIds.length / limit);
        return { 
            redirect: true, 
            page: lastValidPage,
            totalPages: lastValidPage
        };
    }
    
    // Only now fetch the full passages needed for this page
    let feed = [];
    if (paginatedIds.length > 0) {
        feed = await Passage.find({ 
            _id: { $in: paginatedIds }
        }).populate(standardPopulate);
        
        // Fill in usedIn lists
        feed = await fillUsedInList(feed);
        
        // Sort according to the feed order
        feed.sort((a, b) => {
            return paginatedIds.indexOf(a._id.toString()) - paginatedIds.indexOf(b._id.toString());
        });
    }
    
    return {
        feed,
        totalPages: Math.ceil(feedIds.length / limit),
        currentPage: page,
        totalItems: feedIds.length
    };
}

// Helper function for calculating recency score
function calculateRecencyScore(date) {
    const now = Date.now();
    const passageTime = date.getTime();
    const daysSince = (now - passageTime) / (24 * 60 * 60 * 1000);
    
    // Score decreases with age, but never goes to zero
    return Math.max(0.1, 10 - Math.log10(daysSince + 1));
}

async function generateFeedWithPagination(user, page = 1, limit = 10) {
    const cacheKey = `user_feed:${user._id}`;
    const CACHE_EXPIRATION = 3600; // 1 hour in seconds
    
    const redisClient = getRedisClient();
    const redis = getRedisOps();
    
    // Try to get cached feed IDs
    let feedCache = null;
    if (isRedisReady()) {
        console.log("Redis available");
        try {
            feedCache = await redis.get(cacheKey);
        } catch (error) {
            console.error('Redis error when getting user feed cache:', error);
        }
    }
    
    let feedIds;
    
    // If cache doesn't exist or is expired, generate the feed scores
    if (!feedCache) {
        console.log(`Generating new feed for user ${user._id}`);
        // Get filtered passages for this user
        const relevantPassages = await getRelevantPassagesForUser(user);
        // Score passages
        const scoredPassages = await scorePassages(relevantPassages, user);
        feedIds = scoredPassages.map(item => item.passage._id.toString());
        
        // Cache the feed IDs
        if (isRedisReady()) {
            try {
                await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', CACHE_EXPIRATION);
            } catch (error) {
                console.error('Redis error when setting user feed cache:', error);
            }
        }
    } else {
        // Use cached feed IDs
        feedIds = JSON.parse(feedCache);
    }
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedIds = feedIds.slice(startIndex, endIndex);
    
    // Check if we have enough items for this page
    if (paginatedIds.length === 0 && feedIds.length > 0) {
        // Page is beyond available results, redirect to last valid page
        const lastValidPage = Math.ceil(feedIds.length / limit);
        return { 
            redirect: true, 
            page: lastValidPage,
            totalPages: lastValidPage
        };
    }
    
    // Fetch full passage data for paginated IDs
    let feed = [];
    if (paginatedIds.length > 0) {
        const mongoose = require('mongoose');
        feed = await Passage.find({ 
            _id: { $in: paginatedIds.map(id => mongoose.Types.ObjectId(id)) }
        }).populate(standardPopulate);
        
        // Fill in usedIn data
        feed = await fillUsedInList(feed);
        
        // Sort according to the feed order (to maintain ranking)
        feed.sort((a, b) => {
            return paginatedIds.indexOf(a._id.toString()) - paginatedIds.indexOf(b._id.toString());
        });
    }
    
    // Return feed with pagination metadata
    return {
        feed,
        totalPages: Math.ceil(feedIds.length / limit),
        currentPage: page,
        totalItems: feedIds.length
    };
}

async function getPassage(passage, small=true){
    passage.originalSourceList = passage.sourceList.slice();
    // var passage = await Passage.findOne({_id: _id.toString()}).populate('parent author users sourceList subforums collaborators');
    if(passage == null){
        // return res.redirect('/');
        return null;
    }
    var mirror = null;
    var bestOf = null;
    var replacement = null; 
    var replacing = false;
    if(!passage.showBestOf){
        try{
            var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList subforums collaborators versions');
            passage.sourceList.push(mirror);
            // passage.special = await getPassage(mirror);
        }
        catch(e){
            var mirror = null;
        }
        try{
            var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList subforums collaborators versions');
            passage.sourceList.push(bestOf);
            // passage.special = await getPassage(bestOf);
        }
        catch(e){
            var bestOf = null;
        }
        var replacement = mirror == null ? bestOf : mirror;
        var replacing = false;
        replacement = bestOf == null ? mirror : bestOf;
        if(replacement != null){
            replacing = true;
        }
    }
    if(passage == null){
        return false;
    }
    passage.showIframe = false;
    // if(passage == null){
    //     return res.redirect('/');
    // }
    let passageUsers = [];
    if(passage.users != null && passage.users[0] != null){
        // passage.users.forEach(function(u){
        //     passageUsers.push(u._id.toString());
        // });
        for(const u of passage.users){
            passageUsers.push(u._id.toString());
        }
    }
    if(replacing){
        passage.passages = replacement.passages;
    }
    if(replacing && (passage.mirror != null || passage.bestOf != null)){
        passage.lang = replacement.lang;
        passage.content = replacement.content;
        passage.code = replacement.code;
        passage.html = replacement.html;
        passage.css = replacement.css;
        passage.javascript = replacement.javascript;
        passage.filename = replacement.filename;
        passage.mimeType = replacement.mimeType;
        passage.passages = replacement.passages;
        passage.bubbling = replacement.bubbling;
    }
    if(passage.mirrorEntire && passage.mirror != null && replacement != null){
        passage.title = replacement.title;
    }
    if(passage.bestOfEntire && replacement != null){
        passage.title = replacement.title;
    }
    if(replacing && passage.mirror != null){
        passage.isMirrored = true;
    }
    if(replacing && passage.bestOf != null){
        passage.isBestOf = true;
    }
    passage = await bubbleUpAll(passage);
    if(replacing){
    replacement = await bubbleUpAll(replacement);
    }
    if(passage.public == true && !passage.forum){
        
    }
    else{
        if(passage.displayHTML.length > 0 || passage.displayCSS.length > 0 || passage.displayJavascript.length > 0){
            passage.showIframe = true;
        }
        if(passage.forum){
        }
        else{ 
        }
    }
    if(passage.parent != null){
        var parentID = passage.parent._id;
    }
    else{
        var parentID = 'root';
    }
    passage = await fillUsedInListSingle(passage);
    // passage.location = 'test';
    passage.location = await returnPassageLocation(passage);
    // passage.location = 'Test';
    if(passage.showBestOf){
        //get best sub passage
        var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
        if(best != null){
            passage.bestSub = await getPassage(best);
            if(small){
            passage.sourceList.push(best);
            }
            passage.special = passage.bestSub;
            passage.special.isSpecial = true;
            passage.special.specialType = 'Best';
        }
        else{
            passage.bestSub = false;
        }
    }else{
        passage.bestSub = false;
    }
    if(passage.repost != null){
        //get best sub passage
        var repost = await Passage.findOne({_id:passage.repost});
        if(repost != null){
            passage.repostFixed = await getPassage(repost);
            passage.special = passage.repostFixed;
            passage.sourceList.push(repost);
            passage.special.isSpecial = true;
            passage.special.specialType = 'Reposted';
        }
        else{
            passage.repostFixed = false;
        }
    }else{
        passage.repostFixed = false;
    }
    passage.sourceList = await getRecursiveSourceList(passage.sourceList, [], passage, true);
    passage.contributors = getContributors(passage);
    return passage;
}

// Get passages by usage function (from sasame.js line 10040)
async function getPassagesByUsage(options = {}) {
    const { 
        limit = 100,
        timeRange = null,
        minUsageCount = 1,
        excludeVersions = true,
        cursor = null,
        author = null  // Add author parameter with default null
    } = options;
    
    const pipeline = [
        {
            $match: {
                sourceList: { $exists: true, $ne: [] },
                personal: false,
                deleted: false,
                versionOf: null
            }
        },
        { $unwind: "$sourceList" },
        {
            $lookup: {
                from: "Passages",
                localField: "sourceList",
                foreignField: "_id",
                as: "referencedPassage"
            }
        },
        { $unwind: "$referencedPassage" },
        {
            $addFields: {
                isSelfReference: { $eq: ["$author", "$referencedPassage.author"] }
            }
        },
        {
            $group: {
                _id: "$sourceList",
                totalCount: { $sum: 1 },
                nonSelfCount: { 
                    $sum: { $cond: [{ $not: "$isSelfReference" }, 1, 0] }
                },
                passageDetails: { $first: "$referencedPassage" }
            }
        },
        {
            $match: {
                nonSelfCount: { $gte: minUsageCount },
                "passageDetails.personal": false,
                "passageDetails.deleted": false,
                ...(excludeVersions ? { "passageDetails.versionOf": null } : {}),
                ...(timeRange ? { "passageDetails.date": { $gte: timeRange } } : {}),
                ...(author ? { "passageDetails.author": author } : {})  // Add author filter
            }
        },
        { $sort: { nonSelfCount: -1, "passageDetails.date": -1, _id: 1 } }
    ];
    
    if (cursor) {
        const { usageCount, date, _id } = JSON.parse(cursor);
        pipeline.push({
            $match: {
                $or: [
                    { nonSelfCount: { $lt: usageCount } },
                    { 
                        nonSelfCount: usageCount,
                        "passageDetails.date": { $lt: date }
                    },
                    {
                        nonSelfCount: usageCount,
                        "passageDetails.date": date,
                        _id: { $gt: _id }
                    }
                ]
            }
        });
    }
    
    pipeline.push(
        { $limit: limit + 1 },
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: [
                        "$passageDetails",
                        { usageCount: "$nonSelfCount" }
                    ]
                }
            }
        }
    );
    
    const results = await Passage.aggregate(pipeline);
    
    const hasMore = results.length > limit;
    if (hasMore) {
        results.pop();
    }
    
    let nextCursor = null;
    if (hasMore && results.length > 0) {
        const lastItem = results[results.length - 1];
        nextCursor = JSON.stringify({
            usageCount: lastItem.usageCount,
            date: lastItem.date,
            _id: lastItem._id
        });
    }
    
    const populatedResults = await Passage.populate(results, { path: 'author' });
    
    return {
        passages: populatedResults,
        nextCursor,
        hasMore
    };
}

async function getLastSource(passage){
    var source = await Passage.findOne({_id:passage.sourceList.at(-1)});
    return source;
}

// Helper function for file uploads
function getUploadFolder(passage){
    return passage.personal ? 'protected' : 'uploads';
}

// Concat object properties for bubbling content
async function concatObjectProps(passage, sub){
    sub = await bubbleUpAll(sub);
    // console.log(sub.code);
    if(sub.mimeType[0] != 'video' && sub.mimeType[0] != 'audio'){
        if(typeof passage.content != 'undefined')
        passage.displayContent += (typeof sub.displayContent == 'undefined' || sub.displayContent == '' ? '' : sub.displayContent);
        if(typeof passage.code != 'undefined')
            passage.displayCode += (typeof sub.displayCode == 'undefined' || sub.displayCode == '' ? '' : '\n' + sub.displayCode);
        if(typeof passage.html != 'undefined')
            passage.displayHTML += (typeof sub.displayHTML == 'undefined' || sub.displayHTML == '' ? '' : '\n' + sub.displayHTML);
        if(typeof passage.css != 'undefined')
            passage.displayCSS += (typeof sub.displayCSS == 'undefined' || sub.displayCSS == '' ? '' : '\n' + sub.displayCSS);
        if(typeof passage.javascript != 'undefined')
            passage.displayJavascript += (typeof sub.displayJavascript == 'undefined' || sub.displayJavascript == '' ? '' : '\n' + sub.displayJavascript);
    }
    for(var i = 0; i < sub.mimeType.length; ++i){
        if(sub.mimeType[i] == 'video'){
            var filename = sub.filename[i];
            // console.log((filename + '').split('.'));
            //`+passage.filename.split('.').at(-1)+`
            if(passage.video == ''){
                var displayNone = '';
            }else{
                var displayNone = 'style="display:none"';
            }
            passage.video += `
            <video class="uploadedVideo passage-file-`+sub._id+` passage-vid-`+sub.filename[i].split('.')[0]+` passage-video-`+passage._id+`"`+displayNone+`id="passage_video_`+sub._id+`"class="passage_video uploadedVideo"width="320" height="240" controls data-passage-id="`+passage._id+`" data-video-index="`+i+`">
                <source src="/`+getUploadFolder(sub)+`/`+sub.filename[i]+`" type="video/`+sub.filename[i].split('.').at(-1)+`">
                Your browser does not support the video tag.
            </video>
            <script>
                $('.passage-vid-`+sub.filename[i].split('.')[0]+`').on('ended', function(){
                    $(this).css('display', 'none');
                    $(this).next().next().css('display', 'block');
                    $(this).next().next().get(0).play();
                });
            </script>
            `;
        }
        else if(sub.mimeType[i] == 'audio'){
            var filename = sub.filename[i];
            // console.log((filename + '').split('.'));
            //`+passage.filename.split('.').at(-1)+`
            if(passage.audio == ''){
                var displayNone = '';
            }else{
                var displayNone = 'style="display:none"';
            }
            passage.audio += `
            <audio `+displayNone+`id="passage_audio_`+sub._id+`"class="passage_audio passage-aud-`+sub.filename[i].split('.')[0]+`"width="320" height="240" controls>
                <source src="/`+getUploadFolder(sub)+`/`+sub.filename[i]+`" type="audio/`+sub.filename[i].split('.').at(-1)+`">
                Your browser does not support the audio tag.
            </audio>
            <script>
                $('.passage-aud-`+sub.filename[i].split('.')[0]+`').on('ended', function(){
                    $(this).css('display', 'none');
                    $(this).next().next().css('display', 'block');
                    $(this).next().next().get(0).play();
                });
            </script>
            `;
        }
        else if(sub.mimeType[i] == 'image'){
            passage.vidImages.push('/' + getUploadFolder(sub) + '/' + sub.filename[i]);
        }
    }
    // console.log(passage.video);
    // passage.sourceList = [...passage.sourceList, sub, ...sub.sourceList];
}

// Get all sub data for bubbling
async function getAllSubData(passage){
    if(!passage.public && passage.passages && passage.bubbling){
        for(const p of passage.passages){
            if(typeof p == 'undefined'){
                return p;
            }
            var b = p;
            if(p.showBestOf){
                var best = await Passage.findOne({parent: p._id}, null, {sort: {stars: -1}});
                b = best;
            }
            b.displayContent = p.content;
            b.displayCode = p.code;
            b.displayHTML = p.html;
            b.displayCSS = p.css;
            b.displayJavascript = p.javascript;
            if(b.lang == passage.lang){
                await concatObjectProps(passage, await getAllSubData(b));
            }
        }
    }
    return passage;
}

// Bubble up all content and media
async function bubbleUpAll(passage){
    // console.log(passage.passages);
    if(typeof passage == 'undefined'){
        return passage;
    }
    passage.video = '';
    passage.audio = '';
    passage.vidImages = [];
    for(var i = 0; i < passage.filename.length; ++i){
        if(passage.mimeType[i] == 'video'){
            passage.video += `
            <video id="passage_video_`+passage._id+`"class="passage_video uploadedVideo passage-video-`+passage._id+`"width="320" height="240" controls data-passage-id="`+passage._id+`" data-video-index="`+i+`">
                <source src="/`+getUploadFolder(passage)+`/`+passage.filename[i]+`" type="video/`+passage.filename[i].split('.').at(-1)+`">
                Your browser does not support the video tag.
            </video>
            <script>
                $('#passage_video_`+passage._id+`').on('ended', function(){
                    $(this).css('display', 'none');
                    $(this).parent().next().next().css('display', 'block');
                    $(this).parent().next().next().get(0).play();
                });
            </script>
            `;
        }
        else if(passage.mimeType[i] == 'audio'){
            passage.audio += `
            <audio id="passage_audio_`+passage._id+`"class="passage_audio"width="320" height="240" controls>
                <source src="/`+getUploadFolder(passage)+`/`+passage.filename[i]+`" type="audio/`+passage.filename[i].split('.').at(-1)+`">
                Your browser does not support the audio tag.
            </audio>
            <script>
                $('#passage_audio_`+passage._id+`').on('ended', function(){
                    $(this).css('display', 'none');
                    $(this).next().next().css('display', 'block');
                    $(this).next().next().get(0).play();
                });
            </script>
            `;
        }
    }
    passage.displayContent = passage.content;
    passage.displayCode = passage.code;
    passage.displayHTML = passage.html;
    passage.displayCSS = passage.css;
    passage.displayJavascript = passage.javascript;
    if(!passage.bubbling){
        return passage;
    }
    if(!passage.public && !passage.forum){
        passage = await getAllSubData(passage);
        // return getAllSubData(passage);
    }
    // console.log('once'+passage.video);
    return passage;
}

// Get passage location breadcrumb
async function getPassageLocation(passage, train){
    train = train || [];
    // console.log(passage.parent);
    if(passage.parent == null){
        var word = passage.label;
        if(passage.forum){
            word = 'Infinity Forum';
        }
        if(word != 'Infinity Forum' && word !== 'Miscellaneous'){
            console.log('IF');
            console.log('label:'+word);
            word = passage.label + 's';
        }
        if(passage.label == "Social"){
            word = 'Network'
        }
        console.log(word);
        train.push(word);
        return train.reverse();
    }
    else{
        var parent;
        // console.log(passage.parent);
        parent = await Passage.findOne({_id:passage.parent._id.toString()});
        // console.log(parent);
        if(parent == null){
            var word;
            if(!passage.public && !passage.forum){
                word = 'Projects';
            }
            else if(passage.public && !passage.forum){
                word = 'Tasks';
            }
            else if(passage.forum){
                word = 'Infinity Forum';
            }
            train.push(word);
            return train.reverse();
        }
        // parent = passage.parent;
        train.push(parent.title == '' ? 'Untitled' : parent.title);
        return await getPassageLocation(parent, train);
    }
}

// Return passage location as HTML link
async function returnPassageLocation(passage){
    var location = (await getPassageLocation(passage)).join('/');
    // return passage.parent ? passage.parent.title + passage.parent.parent.title : '';
    return '<a style="word-wrap:break-word;"href="'+(passage.parent ? ('/passage/' + (passage.parent.title == '' ? 'Untitled' : encodeURIComponent(passage.parent.title)) + '/' + passage.parent._id) : '/posts') +'">' + location + '</a>';
}

// Create passage function (extracted from sasame.js line 6405)
async function createPassage(user, parentPassageId, subforums=false, comments=false, customDate=null, simulated=false){
    let users = null;
    let parentId = null;
    var isRoot = parentPassageId == 'root';
    var parent;
    var personal = false;
    var fileStreamPath = null;
    var publicReply = false;
    if(user){
        users = [user];
    }
    if(isRoot){
        parentId = null;
    }
    else{
        parentId = parentPassageId;
        parent = await Passage.findOne({_id: parentId});
        if(parent.public_daemon === 2){
            return 'Can not add to or modify public daemon.';
        }
        if(parent.fileStreamPath != null && parent.fileStreamPath.slice(-1) == '/'){
            fileStreamPath = parent.fileStreamPath + 'Untitled';
        }
        personal = parent.personal;
        //by default additions should have the same userlist
        // if(user){
        //     if(parent.users.includes(user._id)){
        //         users = parent.users;
        //     }
        //     else{
        //         for(const u of parent.users){
        //             users.push(u);
        //         }
        //     }
        // }
        //can only add to private or personal if on the userlist or is a forum
        //or is a comment
        if(!comments && !parent.forum && !scripts.isPassageUser(user, parent) && (!parent.public || parent.personal)){
            return "Must be on userlist.";
            // return res.send("Must be on userlist.");
        }
        else if(parent.public_daemon == 2 || parent.default_daemon){
            // return res.send("Not allowed.");
            return "Not allowed."
        }
        publicReply = parent.public ? true : false;
    }
    var lang = 'rich';
    if(parent && parent.lang){
        lang = parent.lang;
    }
    var forum = false;
    if(parent && parent.forum){
        forum = parent.forum;
    }
    var sourceList = parentId == null ? [] : [parentId];
    let passage = await Passage.create({
        author: user,
        users: users,
        parent: parentId,
        sourceList: sourceList,
        // forum: forum,
        lang: lang,
        fileStreamPath: fileStreamPath,
        personal: personal,
        lastUpdated: customDate && simulated ? customDate : Date.now(),
        date: customDate && simulated ? customDate : Date.now(),
        publicReply: publicReply,
        simulated: simulated || false
    });
    if(subforums == 'true'){
        passage.forumType = 'subforum';
        await passage.save();
    }
    if(!isRoot){
        //add passage to parent sub passage list
        if(subforums == 'true'){
            parent.subforums.push(passage);
            parent.markModified('subforums');
        }
        else if(comments == 'true'){
            // parent.comments.push(passage);
            // parent.markModified('comments');
        }
        else{
            console.log("pushed");
            if(!parent.public){
                parent.passages.push(passage);
                parent.markModified('passages');
            }
        }
        await parent.save();
    }
    let find = await Passage.findOne({_id: passage._id}).populate('author sourceList');
    return find;
}

// Share passage function (from sasame.js line 1327)
async function sharePassage(from, _id, username) {
    var user = await User.findOne({
        username: username
    });
    var passage = await Passage.findOne({
        _id: _id
    });
    if(user != null){
        var message = await Message.create({
            from: from,
            to: user._id,
            passage: _id,
            title: passage.title
        });
        return 'Message Sent';
    }
    return 'User not Found.';
}

// Update passage function (from sasame.js line 7250)
async function updatePassage(_id, attributes) {
    var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
    const keys = Object.keys(attributes);
    keys.forEach((key, index) => {
        passage[key] = attributes[key];
    });
    await passage.save();
    return 'Done';
}

async function afterPassageCreation(newPassage) {
    try {
        const redis = getRedisOps();
        // Find users who follow this author
        const followers = await Follower.find({ following: newPassage.author }).distinct('follower');
        
        // For followed authors, inject the new passage into their feed
        for (const followerId of followers) {
            // Get current cached feed
            const cacheKey = `user_feed:${followerId}`;
            if (isRedisReady()) {
                const feedCache = await redis.get(cacheKey);
                
                if (feedCache) {
                    const feedIds = JSON.parse(feedCache);
                    
                    // Insert at the beginning (or using a score-based position)
                    feedIds.unshift(newPassage._id.toString());
                    
                    // Keep the feed at a reasonable size
                    if (feedIds.length > 1000) feedIds.pop();
                    
                    // Update cache
                    await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600);
                }
            }
        }
        
        console.log(`Updated feeds for ${followers.length} followers of ${newPassage.author.username || newPassage.author.name}`);
    } catch (error) {
        console.error('Error in afterPassageCreation:', error);
    }
}

// Handle passage link function (from sasame.js)
function handlePassageLink(passage) {
    // Implementation to be extracted from sasame.js
    return `<a href="/passage/${passage.title}/${passage._id}">${passage.title}</a>`;
}

// Get big passage function (from sasame.js line 2398)
async function getBigPassage(req, res, params=false, subforums=false, comments=false){
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
    let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
    var passage_id = req.query._id;
    if(params){
        passage_id = req.params.passage_id;
    }
    var page = req.query.page || req.params.page || 1;
    var passage = await Passage.findOne({_id: passage_id.toString()}).populate(standardPopulate);
    if(passage == null){
        return res.redirect('/');
    }
    if(passage.personal == true && !scripts.isPassageUser(req.session.user, passage)){
        return res.send(passage + "Must be on Userlist");
    }
    try{
        var mirror = await Passage.findOne({_id:passage.mirror._id});
        passage.sourceList.push(mirror);
    }
    catch(e){
        var mirror = null;
    }
    try{
        var bestOf = await Passage.findOne({parent:passage.bestOf._id}, null, {sort: {stars: -1}});
        passage.sourceList.push(bestOf);
    }
    catch(e){
        var bestOf = null;
    }
    var replacement = mirror == null ? bestOf : mirror;
    var replacing = false;
    replacement = bestOf == null ? mirror : bestOf;
    if(replacement != null){
        replacing = true;
    }
    if(passage == null){
        return false;
    }
    var totalPages = 0;
    if(passage.forum){
        var totalDocuments = await Passage.countDocuments({
            parent: passage._id
        });
        totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    }
    // var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    passage.showIframe = false;
    
    let passageUsers = [];
    if(passage.users != null && passage.users[0] != null){
        for(const u of passage.users){
            passageUsers.push(u._id.toString());
        }
    }
    if(replacing){
        passage.passages = replacement.passages;
    }
    if(replacing && (passage.mirror != null || passage.bestOf != null)){
        passage.lang = replacement.lang;
        passage.content = replacement.content;
        passage.code = replacement.code;
        passage.html = replacement.html;
        passage.css = replacement.css;
        passage.javascript = replacement.javascript;
        passage.filename = replacement.filename;
        passage.mimeType = replacement.mimeType;
    }
    if(passage.mirrorEntire && passage.mirror != null){
        passage.title = replacement.title;
    }
    if(passage.bestOfEntire && passage.bestOf != null){
        passage.title = replacement.title;
    }
    if(replacing && passage.mirror != null){
        passage.isMirrored = true;
    }
    if(replacing && passage.bestOf != null){
        passage.isBestOf = true;
    }
    passage = await getPassage(passage, false);
    if(replacing){
    replacement = await getPassage(replacement, false);
    }
    if(passage.public == true && !passage.forum){
        var subPassages = await Passage.paginate({parent: passage_id.toString(), comment: false}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: standardPopulate});
        subPassages = subPassages.docs;
        var selectedAnswer = await Passage.findOne({parent: passage_id.toString(), selectedAnswer: true}).populate(standardPopulate);
        if(selectedAnswer){
            subPassages.unshift(selectedAnswer);
        }
    }
    else{
        if(passage.displayHTML.length > 0 || passage.displayCSS.length > 0 || passage.displayJavascript.length > 0){
            passage.showIframe = true;
        }
        if(passage.forum){
            var subPassages = await Passage.paginate({parent: passage_id.toString(), comment: false}, {sort: '_id', page: page, limit: DOCS_PER_PAGE, populate: standardPopulate});
            subPassages = subPassages.docs;
        }
        else{ 
            //private passages
            var subPassages = await Passage.find({parent: passage_id.toString(), comment: false, author: {
                $in: passageUsers
            }}).populate(standardPopulate);  
            subPassages = subPassages.filter(function(p){
                return ((p.personal && (!req.session.user || p.author._id.toString() != req.session.user._id.toString())) || p.comment) ? false : true;
            });
        }
    }
    //we have to do this because of issues with populating passage.passages foreign keys
    if(!passage.public && !passage.forum){
        //reorder sub passages to match order of passage.passages
        var reordered = Array(subPassages.length).fill(0);
        for(var i = 0; i < passage.passages.length; ++i){
            for(var j = 0; j < subPassages.length; ++j){
                if(subPassages[j]._id.toString() == passage.passages[i]._id.toString()){
                    reordered[i] = subPassages[j];
                }
            }
        }
        //idk why but sometimes in production there were extra 0s...
        //need to test more and bugfix algorithm above
        reordered = reordered.filter(x => x !== 0); //just get rid of extra 0s
    }
    else{
        var reordered = subPassages;
    }
    if(passage.passages.length < 1){
        reordered = subPassages;
    }
    passage.passages = reordered;
    for(var i = 0; i < passage.passages.length; ++i){
        passage.passages[i] = await getPassage(passage.passages[i]);
    }
    if(passage.parent != null){
        var parentID = passage.parent._id;
    }
    else{
        var parentID = 'root';
    }
    passage = await fillUsedInListSingle(passage);
    passage.passages = await fillUsedInList(passage.passages);
    if(subforums){
        passage.passages = passage.subforums;
    }
    else if(comments){
        var comments = await Passage.paginate({$or: [
            {comment: true},
            {publicReply:true}
        ],parent:passage._id}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: standardPopulate});
        passage.passages = comments.docs;
        for(var i = 0; i < passage.passages.length; ++i){
            passage.passages[i] = await getPassage(passage.passages[i]);
        }
    }else{
        //remove subforums from passages
        passage.passages = passage.passages.filter(function(value, index, array){
            return value.sub == false;
        });
    }
    var bigRes = {
        subPassages: passage.passages,
        passage: passage,
        passageTitle: passage.title,
        passageUsers: passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: passage, passages: false, totalPages: totalPages, docsPerPage: DOCS_PER_PAGE,
        ISMOBILE: ISMOBILE,
        parentID: parentID

    };
    if(!bigRes){
        return res.redirect('/');
    }
    if(bigRes.passage.personal && bigRes.passage.author._id.toString() != req.session.user._id &&
        !bigRes.passage.users.includes(req.session.user._id)){
        return res.redirect('/');
    }
    if(bigRes.passage.personal && bigRes.passage.author._id.toString() != req.session.user._id &&
        !bigRes.passage.users.includes(req.session.user._id)){
        return res.redirect('/');
    }
    bigRes.subPassages = await fillUsedInList(bigRes.subPassages);
    bigRes.subPassages.filter(function(p){
        if(p.personal && p.author._id.toString() != req.session.user._id.toString() && !p.users.includes(req.session.user._id.toString())){
            return false;
        }
        return true;
    });
    console.log('test2'+passage.originalSourceList.length);
    console.log(passage.sourceList.length);
    return bigRes;
}

// Get recursive specials function (from sasame.js line 4477)
async function getRecursiveSpecials(passage){
    var special = null;
    if(passage.showBestOf == true){
        special = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
        if(special != null)
        special = special._id;
    }
    if(passage.best != null){
        special = passage.best;
    }
    if(passage.repost != null){
        special = passage.repost;
    }
    if(passage.bestOf != null){
        special = passage.bestOf;
    }
    if(passage.mirror != null){
        special = passage.mirror;
    }
    if(special != null){
        special = await Passage.findOne({_id:special});
    }
    if(special == null){
        return null;
    }
    else{
        //because this is sometimes set by getPassage
        if(typeof passage.special == 'undefined'){
            passage.special = special;
        }
        await getRecursiveSpecials(special);
    }
}

async function clearForum(){
    await Passage.deleteMany({forumSpecial: true});
}
//fill forum with presets
async function fillForum(req){
    const fsp = require('fs').promises;
    var file = await fsp.readFile('../dist/json/forum.json');
    var json = JSON.parse(file);
    //create over directory passage
    var infinity = await Passage.create({
        author: req.session.user,
        users: [req.session.user],
        parent: null,
        title: "Infinity Forum",
        forumSpecial: true,
        tracker: 0,
        forumType: 'header'
    });
    infinity = await Passage.findOne({forumType: 'header'});
    for(const category of json.categories){
        var passage = await Passage.create({
            author: req.session.user,
            users: [req.session.user],
            parent: infinity._id.toString(),
            title: category.name,
            forumSpecial: true,
            tracker: category.tracker,
            forumType: 'category'
        });
        infinity.passages.push(passage);
        infinity.markModified('passages');
        await infinity.save();
        for(const cat of json.subcats){
            if(cat.parentTracker == category.tracker){
                var passage2 = await Passage.create({
                    author: req.session.user,
                    users: [req.session.user],
                    parent: passage._id,
                    forum: true,
                    title: cat.name,
                    forumSpecial: true,
                    content: cat.desc,
                    tracker:cat.tracker,
                    parentTracker: category.tracker,
                    forumType: 'subcat'
                });
                passage.passages.push(passage2);
                passage.markModified('passages');
                await passage.save();
                for(const sub of json.subforum){
                    if(sub.parentTracker == cat.tracker){
                        var passage3 = await Passage.create({
                            author: req.session.user,
                            users: [req.session.user],
                            parent: passage2._id,
                            forum: true,
                            title: sub.name,
                            forumSpecial: true,
                            parentTracker: cat.tracker,
                            tracker: sub.tracker,
                            forumType: 'subforum',
                            sub: true
                        });
                        passage2.subforums.push(passage3);
                        passage2.markModified('subforums');
                        await passage2.save();
                    }
                }
            }
        }
    }
    // for(const category of json.categories){
    //     await Category.create({
    //         name: category.name,
    //         tracker: category.tracker
    //     });
    // }
    // for(const cat of json.subcats){
    //     await Subcat.create({
    //         parentTracker: cat.parentTracker,
    //         name: cat.name,
    //         desc: cat.desc,
    //         tracker: cat.tracker
    //     });
    // }
    // for(const sub of json.subforum){
    //     await Subforum.create({
    //         parentTracker: sub.parentTracker,
    //         tracker: sub.tracker,
    //         name: sub.name,
    //         desc: sub.desc
    //     });
    // }
    console.log("DONE.");
}

async function logVisit(req, passageID){
    let ipAddress = req.clientIp; // Default to req.ip
    let ipNumber = ipAddress.split('.').map(Number).reduce((a, b) => (a << 8) + b, 0);


    // Check other custom headers if needed


    const existingVisitor = await Visitor.findOne({ ipNumber });


    if (!existingVisitor) {
    // Create a new visitor entry
    const newVisitor = new Visitor({ ipNumber: ipNumber, user: req.session.user || null, visited: passageID });
    await newVisitor.save();
    }
}

//for daemons access to help code
function DAEMONLIBS(passage, USERID){
    return `
    
    var THIS = `+JSON.stringify(passage)+`;
    var USERID = "`+(USERID)+`";
    // async function INTERACT(content){
    //     const result = await $.ajax({
    //         type: 'post',
    //         url: '`+process.env.DOMAIN+`/interact',
    //         data: {
    //             _id: _id
    //         }});
    //     return result;
    // }
    async function GETDAEMON(daemon, param){
        var passage = await GETPASSAGE(daemon);
        var code = passage.code;
        var parameter = await GETPASSAGE(param);
        //add Param Line
        code = "const PARAM = " + JSON.stringify(parameter) + ';' + code;
        
        //then eval code
        return code;
    }
    async function GETPASSAGE(_id){
        //run ajax
        const result = await $.ajax({
            type: 'get',
            url: '`+process.env.DOMAIN+`/get_passage',
            data: {
                _id: _id
            }});
        return result;
    }
    
    `;
}

/**
     * Updates the feed in the background
     * This should be called from a cron job or similar
     */
async function scheduleBackgroundFeedUpdates() {
    console.log("FIRE");
  try {
    // Find active users who have logged in recently
    const activeTimeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const activeUsers = await User.find({
      lastLogin: { $gte: activeTimeThreshold }
    });
    
    console.log(`Scheduling feed updates for ${activeUsers.length} active users`);
    
    // Process users in batches to avoid overwhelming the system
    const batchSize = 50;
    
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);
      
      // Process each user in the batch
      await Promise.all(batch.map(async (user) => {
        try {
          const hoursSinceLastLogin = (Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60);
          
          // Determine refresh frequency based on activity
          let refreshInterval;
          if (hoursSinceLastLogin < 24) {
            refreshInterval = 3 * 60 * 60 * 1000; // 3 hours for very active users
          } else if (hoursSinceLastLogin < 72) {
            refreshInterval = 6 * 60 * 60 * 1000; // 6 hours for moderately active users
          } else {
            refreshInterval = 12 * 60 * 60 * 1000; // 12 hours for less active users
          }
          
          // Add a one-time job to update this user's feed
          // We'll rely on cron jobs to re-schedule active users
          var feedQueue = getFeedQueue();
          await feedQueue.add(
            { userId: user._id.toString() },
            { 
              jobId: `feed-update-${user._id}`,
              removeOnComplete: true,
              removeOnFail: false
            }
          );
          
          // Add immediate job for testing
          // await feedQueue.add(
          //   { userId: user._id.toString() },
          //   { delay: 0 }  // Run immediately, no jobId so it doesn't conflict
          // );
        } catch (error) {
          console.error(`Error scheduling feed update for user ${user._id}:`, error);
        }
      }));
      
      // Small delay between batches to reduce database load
      if (i + batchSize < activeUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Completed scheduling feed updates`);
  } catch (error) {
    console.error('Error in scheduleBackgroundFeedUpdates:', error);
  }
}
/**
 * Get relevant passages for a user's feed with efficient filtering
 */
async function getRelevantPassagesForUser(user, limit = 1000) {
  // Get followed authors
  const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
  
  // Time windows
  const veryRecentCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 1 week
  const recentCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // 3 months
  
  // First-stage filtering
  const passageQuery = { 
      versionOf: null,
      personal: false,
      deleted: false,
      simulated: false,
      forumType: {$in: ['', null]},
      $and: [
        {
          $or: [
            { author: { $in: followedAuthors } }, // From followed authors
            { date: { $gte: veryRecentCutoff } }, // Very recent content
            { stars: { $gte: 0 } }, // Content with engagement
            { 
              date: { $gte: recentCutoff },
              stars: { $gte: 0 } // Recent with some engagement
            }
          ]
        },
        {
          $or: [
            { content: { $ne: '' } },
            { code: { $ne: '' } }
          ]
        }
      ]
    };
  
  // Get passages with filtered query
  const passages = await Passage.find(passageQuery)
    .populate([
        { path: 'author' },
        { path: 'users' },
        { path: 'sourceList' },
        { path: 'parent' },
        { path: 'collaborators' },
        { path: 'versions' },
        { path: 'mirror' },
        { path: 'comments', select: 'author' }, // Only need author field from comments
        { path: 'passages', select: 'author' }  // Only need author field from sub-passages
      ])
    .sort('-stars -date')
    .limit(1000);
  console.log("LENGTH:"+passages.length);
  return passages;
}
/**
 * Process the feed generation job from the queue
 */
async function processFeedGenerationJob(job) {
  const { userId } = job.data;
  
  try {
    console.log(`Processing feed update for user ${userId}`);
    
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User ${userId} not found when processing feed update`);
      return { success: false, error: 'User not found' };
    }
    
    // Get filtered passages for this user
    const relevantPassages = await getRelevantPassagesForUser(user);
    
    // Score passages
    const scoredPassages = await scorePassages(relevantPassages, user);
    
    // Extract IDs and cache the feed
    const feedIds = scoredPassages.map(item => item.passage._id.toString());
    const cacheKey = `user_feed:${userId}`;

    const redis = getRedisOps();
    
    await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600); // 1 hour cache
    
    return { 
      success: true, 
      userId,
      feedSize: feedIds.length
    };
  } catch (error) {
    console.error(`Error in processFeedGenerationJob for user ${userId}:`, error);
    return { 
      success: false, 
      userId,
      error: error.message
    };
  }
}
/**
 * Scores passages for feed ranking
 * 
 * @param {Array} passages - Array of passage objects to score
 * @param {Object} user - Current user
 * @return {Array} Scored and sorted passages
 */
async function scorePassages(passages, user=null) {
  // Get list of authors the user follows
    if(user != null){
        var followedAuthors = await Follower.find({ user: user._id }).distinct('following');
    }
  // Track author counts as we go through the scoring
  const authorAppearances = {};
  const scoredPassages = [];

  
  for (const passage of passages) {
    const authorId = passage.author._id.toString();
    // Count this appearance (start at 0)
    authorAppearances[authorId] = (authorAppearances[authorId] || 0);
    // Get distinct authors who used this passage (excluding the original author)
    const usedByAuthors = await Passage.find({
      sourceList: { $in: [passage._id] },
      versionOf: null,
      author: { $ne: passage.author._id }
    }).distinct('author');
    
    // Calculate comment count based on passage type, excluding author's own comments
    let commentCount = 0;
    
    if (passage.private === true && passage.comments) {
      commentCount = passage.comments.filter(comment => 
        comment.author && comment.author.toString() !== passage.author._id.toString()
      ).length;
    } else if (passage.private === false && passage.passages) {
      commentCount = passage.passages.filter(subPassage => 
        subPassage.author && subPassage.author.toString() !== passage.author._id.toString()
      ).length;
    }
    
    // Apply logarithmic scaling to prevent dominance by any one factor
    const dateField = passage.createdAt || passage.date;
    const recencyScore = calculateRecencyScore(dateField);
    const starScore = Math.log10(passage.stars + 1) * 1.5; // Logarithmic scaling
    const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;
    const commentScore = Math.log10(commentCount + 1) * 1.5;
    
    // Apply social factor bonuses
    if(user != null){
        var followedAuthorBonus = followedAuthors.includes(passage.author._id.toString()) ? 1.3 : 1;
    }else{
        console.log("FLAIR");
        var followedAuthorBonus = 1;
    }

    // Apply author diversity penalty - stronger with each appearance
    // First appearance has no penalty (factor = 1.0)
    const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);
    
    // Stronger randomness factor (between 0.6 and 1.4)
    const randomnessFactor = 0.6 + (Math.random() * 0.8);
    
    // Calculate final score with weighted components
    const score = (
      (recencyScore * 0.35) +      // 35% weight for recency
      (starScore * 0.2) +          // 20% weight for stars
      (usedByScore * 0.25) +       // 15% weight for usage
      (commentScore * 0.15)        // 15% weight for comments
    ) * followedAuthorBonus * authorDiversityFactor * randomnessFactor;
    
    scoredPassages.push({
      passage,
      score,
      // Add debug info to help understand scoring (remove in production)
      // debug: {
      //   recency: recencyScore * 0.35,
      //   stars: starScore * 0.2,
      //   usedBy: usedByScore * 0.15,
      //   comments: commentScore * 0.15,
      //   authorBonus: followedAuthorBonus,
      //   random: randomnessFactor
      // }
    });
    // Increment author appearance count for next time
    authorAppearances[authorId]++;
  }
  
  // Add an additional shuffle step to further randomize when scores are close
  scoredPassages.sort((a, b) => {
    // If scores are within 10% of each other, randomize their order
    if (Math.abs(a.score - b.score) < (a.score * 0.1)) {
      return Math.random() - 0.5;
    }
    return b.score - a.score; // Otherwise use score order
  });
  
  console.log("Score distribution:", 
    scoredPassages.slice(0, 10).map(p => 
      JSON.stringify({id: p.passage._id.toString().substr(-4), score: p.score.toFixed(2)})
    )
  );
  
  return scoredPassages;
}
//get all the parents of a passage in a chain
async function getChain(passage, chain=[]){
    if(passage.parent !== null){
        chain.unshift(passage.parent._id.toString());
        var p = await Passage.findOne({
            _id: passage.parent._id.toString()
        }).populate('parent');
        return await getChain(p, chain);
    }else{
        return chain;
    }
}
module.exports = {
    deletePassage,
    scheduleBackgroundFeedUpdates,
    logVisit,
    copyPassage,
    getRecursiveSourceList,
    fillUsedInList,
    fillUsedInListSingle,
    getLastSource,
    generateGuestFeed,
    generateFeedWithPagination,
    getPassage,
    getPassagesByUsage,
    // bubbleUpAll,
    getPassageLocation,
    returnPassageLocation,
    getUploadFolder,
    createPassage,
    sharePassage,
    updatePassage,
    afterPassageCreation,
    handlePassageLink,
    getBigPassage,
    getRecursiveSpecials,
    fillForum,
    clearForum,
    DAEMONLIBS,
    getRelevantPassagesForUser,
    processFeedGenerationJob,
    scorePassages,
    updateLabel,
    standardPopulate,
    getContributors,
    getAllContributors,
    getChain
};