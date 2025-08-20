'use strict';

const { Passage } = require('../models/Passage');
const Message = require('../models/Message');
const { User } = require('../models/User');
const { 
    fillUsedInList, 
    generateGuestFeed, 
    generateFeedWithPagination, 
    getPassage, 
    getPassagesByUsage,
    standardPopulate
} = require('../services/passageService');

// Constants (this should be imported from a config file)
const DOCS_PER_PAGE = 10;

async function paginate(req, res) {
    try {
        var { page, profile, search = '', parent = 'root', whichPage, sort = 'Most Stars', label = 'All', from_ppe_queue } = req.body;
        // Handle standard passages
        let passages;
        if (!['filestream', 'messages', 'leaderboard'].includes(profile)) {
            let find = {
                personal: false,
                versionOf: null,
                forumType: {$in: ['', null]},
                title: new RegExp(search, "i"),
                team: null
            };
            
            // Add simulated filter based on request parameter
            if (req.body.simulated === 'true') {
                find.simulated = true;
            } else {
                find.simulated = false;
            };
            console.log("WHICH PAGE:"+whichPage);
            console.log(profile);
            switch(whichPage) {
                case 'tasks':
                    find.public = true;
                    find.forum = false;
                    break;
                case 'projects':
                    find.public = false;
                    find.forum = false;
                    break;
                case 'personal':
                    find.personal = true;
                    find.users = { $in: [req.session.user._id] };
                    break;
                case 'feed':
                    break;
                case 'stream':
                    break;
                case 'market':
                    label = 'Product';
                    break;
            }
            if (parent !== 'root') find.parent = parent;
            if (profile !== 'false') find.author = profile;
            console.log(profile);
            console.log("TEST");
            if (from_ppe_queue) find.mimeType = 'image';
            if (label !== 'All') find.label = label;

            var sort_query = {stars: -1, _id: -1};
            const cursor = req.body.cursor || null;
            var result;
            switch(sort) {
            case 'Most Relevant':
                //show by most stars if searching
                    if(search != ''){
                        sort = {stars: -1, _id: -1};
                    }else{
                        if(whichPage == 'stream'){
                         // Generate feed for guest users
                            result = await generateGuestFeed(page, DOCS_PER_PAGE);
                        }else if(whichPage == 'feed'){
                            result = await generateFeedWithPagination(req.session.user, page, DOCS_PER_PAGE);
                        }
                        passages = {};
                        passages.docs = [];
                        if('feed' in result){
                            for (let i = 0; i < result.feed.length; i++) {
                              const processedPassage = await getPassage(result.feed[i]);
                              passages.docs.push(processedPassage);
                            }
                        }else{
                            return res.send("No more passages.");
                        }
                    }
                    break;
                case 'Most Stars':
                    sort_query = {stars: -1, _id: -1};
                    break;
                case 'Most Cited':
                    result = await getPassagesByUsage({
                      cursor: cursor,
                      limit: 1,
                      minUsageCount: 2
                    });
                    var results = result.passages;
                    for(var i = 0; i < results.length; ++i){
                        results[i] = await fillUsedInList(results[i]);
                        results[i] = await getPassage(results[i]);
                    }
                    return res.render('passages', {
                            subPassages: false,
                            passages: results,
                            sub: true,
                            subPassage: false,
                            page: page,
                            cursor: result.nextCursor
                        });
                    break;
                case 'Newest-Oldest':
                    sort_query = {date: -1};
                    console.log("NEWEST");
                    break;
                case 'Oldest-Newest':
                    sort_query = {date: 1};
                    console.log("Oldest");
                    break;
                case 'Highest Reward':
                    sort_query = {reward: -1, _id: 1};
                    break;
            }

            try {
                if(sort != 'Most Relevant'){
                    passages = await Passage.paginate(find, {
                        sort: sort_query, 
                        page: page, 
                        limit: DOCS_PER_PAGE, 
                        populate: standardPopulate
                    });
                }
                
            } catch (err) {
                console.error('Error in pagination:', err);
                throw err;
            }

            // Process passages with error handling for each
            const processedPassages = [];
            for (let i = 0; i < passages.docs.length; i++) {
                try {                        
                    let passageWithUsedIn = await fillUsedInList(passages.docs[i]);
                    let processedPassage = await getPassage(passageWithUsedIn);
                    
                    if (processedPassage) {
                        processedPassages.push(processedPassage);
                    }
                } catch (err) {
                    console.error(`Error processing passage ${passages.docs[i]._id}:`, err);
                    console.error('Problem passage data:', JSON.stringify(passages.docs[i], null, 2));
                    // Continue with next passage instead of crashing
                    continue;
                }
            }

            console.log(`Successfully processed ${processedPassages.length} passages`);

            if (!from_ppe_queue) {
                return res.render('passages', {
                    subPassages: false,
                    passages: processedPassages,
                    sub: true,
                    subPassage: false,
                    page: page
                });
            } else {
                return res.render('ppe_thumbnails', {
                    thumbnails: processedPassages,
                });
            }
        }
        else if(profile == 'messages'){
            console.log('messages');
            let find = {
                title: new RegExp(''+search+'', "i"),
                to: req.session.user._id
            };
            var messages = await Message.paginate(find,
            {sort: '-stars', page: page, limit: DOCS_PER_PAGE, populate: 'author users passage'});
            passages = [];
            for(const message of messages.docs){
                var p = await Passage.findOne({
                    _id: message.passage._id
                }).populate('author users sourcelist');
                passages.push(p);
            }
            for(var i = 0; i < passages.length; ++i){
                passages[i] = await getPassage(passages[i]);
            }
            res.render('passages', {
                passages: passages,
                subPassages: false,
                sub: true,
            });
        }
        else if(profile == 'filestream'){
            console.log(profile);
        }
        else if(profile == 'leaderboard'){
            console.log("leaderboard!");
            let find = {
                username: new RegExp(''+search+'', "i")
            };
            if(search == ''){
                var rank = true;
            }
            else{
                var rank = false;
            }
            console.log("LEADERBOARD PAGE:"+page);
            var limit = DOCS_PER_PAGE * 2;
            let users = await User.paginate(find, {sort: "-starsGiven, _id", page: page, limit: limit});
            console.log(users.docs.length);
            res.render('leaders', {users: users.docs, page: page, rank: rank});
        }

    } catch (error) {
        console.error('Fatal error in pagination:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message,
            stack: process.env.LOCAL === 'true' ? error.stack : undefined
        });
    }
}

module.exports = {
    paginate
};