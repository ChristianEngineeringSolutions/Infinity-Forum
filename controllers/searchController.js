'use strict';

const { Passage } = require('../models/Passage');
const Message = require('../models/Message');
const { User } = require('../models/User');
const { scripts } = require('../common-utils');
const { getPassage, fillUsedInList, fillUsedInListSingle, generateGuestFeed, standardPopulate } = require('../services/passageService');

// Constants
const DOCS_PER_PAGE = 10;

// Search leaderboard route handler (from sasame.js line 2978)
async function searchLeaderboard(req, res) {
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let results = await User.find({

        username: {
        $regex: search,
        $options: 'i',
    }}).sort('-starsGiven').limit(20);
    if(search == ''){
        var rank = true;
    }
    else{
        var rank = false;
    }
    res.render("leaders", {
        users: results,
        page: 1,
        rank: rank
    });
}

// Search profile route handler (from sasame.js line 2998)
async function searchProfile(req, res) {
    console.log("TEST");
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var find = {
        author: req.body._id,
        deleted: false,
        personal: false,
        versionOf: null,
        title: {$regex:search,$options:'i'},
        // $or: [
        //     {title: {$regex:search,$options:'i'}},
        //     {content: {$regex:search,$options:'i'}},
        //     {code: {$regex:search,$options:'i'}},
        // ],
    };
    if(req.body.label != 'All'){
        find.label = req.body.label;
    }
    var sort = {stars: -1, _id: -1};
    switch(req.body.sort){
        case 'Most Stars':
            sort = {stars: -1, _id: -1};
            break;
        case 'Newest-Oldest':
            sort = {date: -1};
            console.log(find.author);
            break;
        case 'Oldest-Newest':
            sort = {date: 1};
            break;
    }
    let results = await Passage.find(find).populate('author users sourceList').sort(sort).limit(DOCS_PER_PAGE);
    for(var i = 0; i < results.length; ++i){
        results[i] = await getPassage(results[i]);
    }
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true,
        subPassage: false,
        page: 1
    });
}

// Search messages route handler (from sasame.js line 3041)
async function searchMessages(req, res) {
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var find = {
        to: req.session.user._id,
        title: {$regex:search,$options:'i'},
        // $or: [
        //     {title: {$regex:search,$options:'i'}},
        //     {content: {$regex:search,$options:'i'}},
        //     {code: {$regex:search,$options:'i'}},
        // ],
    };
    if(req.body.label != 'All'){
        find.label = req.body.label;
    }
    var sort = {stars: -1, _id: -1};
    switch(req.body.sort){
        case 'Most Stars':
            sort = {stars: -1, _id: -1};
            break;
        case 'Newest-Oldest':
            sort = {date: -1};
            break;
        case 'Oldest-Newest':
            sort = {date: 1};
            break;
    }
    var messages = await Message.find(find).populate('passage').sort(sort).limit(DOCS_PER_PAGE);
    var passages = [];
    for(const message of messages){
        var p = await Passage.findOne({
            _id: message.passage._id
        }).populate('author users sourcelist');
        passages.push(p);
    }
    for(var i = 0; i < passages.length; ++i){
        passages[i] = await getPassage(passages[i]); // Fixed bug from sasame.js line 3076
    }
    res.render("passages", {
        passages: passages,
        subPassages: false,
        sub: true,
        subPassage:false,
        page: 1
    });
}

// PPE search route handler (from sasame.js line 3086)
async function ppeSearch(req, res) {
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let parent = req.body.parent == 'root' ? null : req.body.parent;
    let results = await Passage.find({
        parent: parent,
        deleted: false,
        personal: false,
        simulated: false,
        mimeType: 'image',
        title: {
        $regex: search,
        $options: 'i',
    }}).populate(standardPopulate).sort('-stars').limit(DOCS_PER_PAGE);
    for(var i = 0; i < results.length; ++i){
        results[i] = await getPassage(results[i]);
    }
    res.render("ppe_thumbnails", {
        thumbnails: results,
    });
}

// Search passage route handler (from sasame.js line 3126)
async function searchPassage(req, res) {
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    var find = {
        deleted: false,
        personal: false,
        // versionOf: null,
        parent: req.body._id,
        title: {$regex:search,$options:'i'},
        // $or: [
        //     {title: {$regex:search,$options:'i'}},
        //     {content: {$regex:search,$options:'i'}},
        //     {code: {$regex:search,$options:'i'}},
        // ],
    };
    if(req.body.label != 'All'){
        find.label = req.body.label;
    }
    var sort = {stars: -1, _id: -1};
    switch(req.body.sort){
        case 'Most Stars':
            sort = {stars: -1, _id: -1};
            break;
        case 'Newest-Oldest':
            sort = {date: -1};
            break;
        case 'Oldest-Newest':
            sort = {date: 1};
            break;
    }
    console.log(sort);
    let results = await Passage.find(find).populate(standardPopulate).sort(sort).limit(DOCS_PER_PAGE);
    if(results.length < 1 && req.session.user){
        var parent = await Passage.findOne({_id: req.body._id});
        let users = [req.session.user._id];
        if(parent.public && !parent.personal){
            //by default additions should have the same userlist
            if(parent.users.includes(req.session.user._id)){
                users = parent.users;
            }
            else{
                for(const u of parent.users){
                    users.push(u);
                }
            }
            //can only add to private or personal if on the userlist
            if(!scripts.isPassageUser(req.session.user, parent) && (!parent.public || parent.personal)){
                //do nothing
            }
            else if(parent.public_daemon == 2 || parent.default_daemon){
                //do nothing
            }
            else if(parent.public){
                // let passage = await Passage.create({
                //     author: req.session.user._id,
                //     users: users,
                //     parent: req.body._id,
                //     title: req.body.search,
                //     public: true
                // });
                // parent.passages.push(passage);
                // await parent.save();
                // results = [passage];
            }
        }
    }
    for(var i = 0; i < results.length; ++i){
        results[i] = await getPassage(results[i]);
    }
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true,
        subPassage:true,
        page: 1
    });
}

// Main search route handler (from sasame.js line 3226)
async function search(req, res) {
    try {
        // Debug logging to identify the issue
        console.log("=== SEARCH ROUTE DEBUG ===");
        console.log("req.body:", JSON.stringify(req.body, null, 2));
        console.log("req.params:", JSON.stringify(req.params, null, 2));
        console.log("req.query:", JSON.stringify(req.query, null, 2));
    
    // Check each field that might contain "div"
    Object.keys(req.body || {}).forEach(key => {
        if (req.body[key] === "div") {
            console.log(`WARNING: req.body.${key} contains "div"`);
        }
    });
    
    console.log("FLAIR");
    var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var label = req.body.label;
    var matchStage = {
        deleted: false,
        versionOf: null,
        personal: req.body.personal === 'true', // Convert string to boolean
        simulated: false,
        title: {$regex:search,$options:'i'},
        team: null
    };

    // Add label filter if not 'All'
    if (label != 'All') {
        matchStage.label = req.body.label;
    }

    // Add personal filter if true
    if (req.body.personal === 'true' && req.session.user && req.session.user._id) {
        matchStage.users = { $in: [req.session.user._id] };
    }

    switch (req.body.whichPage) {
        case 'tasks':
            matchStage.public = true;
            matchStage.forum = false;
            break;
        case 'projects':
            matchStage.public = false;
            matchStage.forum = false;
            break;
        case 'market':
            matchStage.public = true;
            matchStage.forum = false;
            matchStage.label = 'Product';
        // case 'feed': // ... (your feed logic) ...
    }
    console.log("FLAIR2");
    var sort = { stars: -1, _id: -1 };
    var results;
    var nextCursor = null;
    var feed = false;
    switch (req.body.sort) {
        case 'Most Relevant':
            if(search != '' || label != 'All'){
                    sort = {stars: -1, _id: -1};
                }else{
                     // Generate feed for guest users
                    console.log("Guest feed");
                    var result = await generateGuestFeed(1, DOCS_PER_PAGE);
                    var passages = {};
                    passages.docs = [];
                    if('feed' in result){
                        for (let i = 0; i < result.feed.length; i++) {
                          const processedPassage = await getPassage(result.feed[i]);
                          passages.docs.push(processedPassage);
                        }
                        var results = passages.docs;
                    }else{
                        return res.send("No more passages.");
                    }
                    feed = true;
                }
            break;
        case 'Most Stars':
            sort = { stars: -1, _id: -1 };
            break;
        case 'Most Cited':
            sort = { stars: -1, _id: -1 };
            break;
        case 'Newest-Oldest':
            sort = { date: -1 };
            break;
        case 'Oldest-Newest':
            sort = { date: 1 };
            break;
    }
    console.log("FLAIR3");
    if (!feed) {
        console.log("FLAIR14");
        results = await Passage.find(matchStage).populate(standardPopulate).sort(sort).limit(DOCS_PER_PAGE); 
        for(var i = 0; i < results.length; ++i){
            results[i] = await fillUsedInListSingle(results[i]);
            results[i] = await getPassage(results[i]);
        }         
    }
    console.log("FLAIR4");
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true,
        subPassage: false,
        page: 1
    });
    } catch (error) {
        console.error("=== ERROR IN SEARCH ROUTE ===");
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.error("Error type:", error.constructor.name);
        throw error;
    }
}
async function testSearch(req, res){
    console.log("test");
    return res.send("test");
}
module.exports = {
    searchLeaderboard,
    searchProfile,
    searchMessages,
    ppeSearch,
    searchPassage,
    search,
    testSearch
};