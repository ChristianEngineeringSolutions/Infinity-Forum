const express = require('express');
const router = express.Router();
const passageController = require('../controllers/passageController');

// Import dependencies for passage routes
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { Notification } = require('../models/Notification');
const { scripts, sortArray } = require('../common-utils');
const browser = require('browser-detect');
const rateLimit = require('express-rate-limit');
const DOCS_PER_PAGE = 10;

// Import from other controllers
const { getRemotePage } = require('../controllers/systemController');
const { createBookmark } = require('../controllers/bookmarkController');
const { uploadFile, updateFile, getDirectoryStructure, decodeDirectoryStructure } = require('../controllers/fileController');

// Rate limiter for create initial passage endpoint
const intialPassageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // Limit each IP to 20 requests per windowMs
  message: 'Too many passages created, please try again after a minute.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Main passage display routes - from sasame.js

router.get('/posts', passageController.postsPage);

router.get('/forum', passageController.forumPage);

router.get('/personal/:user_id', passageController.personalPage);

// Feed route - from sasame.js line 8912
router.get('/feed', async (req, res) => {
    
});

// GET routes for passage display

// Get passage route - from sasame.js line 1853
router.get('/get_passage', async (req, res) => {
    //run authentication for personal passages
    var passage = await Passage.findOne({_id: req.query._id})
    if(!passage.personal || (passage.personal && req.session.user._id.toString() == passage.author._id.toString())){
        return res.send(JSON.stringify(passage));
    }
    else{
        return res.send('Improper Credentials.');
    }
});

// Passage form route - from sasame.js line 6402
router.get('/passage_form/', (req, res) => {
    res.render('passage_form');
});

// Create routes

// Create passage route - from sasame.js line 6496
router.post('/create_passage/', async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    let user = req.session.user || null;
    var newPassage = await passageController.createPassage(user, req.body.passageID);
    res.render('passage', {subPassages: false, passage: newPassage, sub: true});
});

// Create initial passage route - from sasame.js line 6515 (truncated for length but with proper imports)
router.post('/create_initial_passage/', intialPassageLimiter, async (req, res) => {
    if(!req.session.user){
        return res.send("You must log in to create a passage.");
    }
    let user = req.session.user || null;
    var chief = req.body.chief;
    if(req.body['post-top'] && req.body['post-top'] == 'on'){
        chief = 'root';
    }
    //create passage
    var customDate = req.body.simulated === 'true' && req.body.date ? new Date(req.body.date) : null;
    var isSimulated = req.body.simulated === 'true';
    var newPassage = await passageController.createPassage(user, chief.toString(), req.body.subforums, req.body.comments, customDate, isSimulated);
    if(newPassage == 'Not allowed.' || newPassage == 'Must be on userlist.'){
        return res.send(newPassage);
    }
    //update passage
    var formData = req.body;
    var repost = req.body.repost == 'true' ? true : false;
    var repostID = req.body['repost-id'];
    var passage = await Passage.findOne({_id: newPassage._id}).populate('author users sourceList collaborators versions');
    passage.yt = formData.yt;
    if(repost){
        var reposted = await Passage.findOne({_id:repostID});
        passage.repost = repostID;
        console.log(repostID);
    }
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    else if(passage.public_daemon == 2 || passage.default_daemon){
        return res.send("Not allowed.");
    }
    switch(req.body.whichPage){
        case 'tasks':
            passage.public = true;
            break;
        case 'personal':
            passage.personal = true;
            break;
    }
    var parent = null;
    if(chief !== 'root'){
        parent = await Passage.findOne({_id:chief.toString()});
        // passage.forum = parent.forum;
        if(parent.forumType == 'category'){
            if(req.body.subforums != 'true'){
                passage.forumType = 'subcat';
            }
            passage.forum = true;
        }
    }
    if(req.body.comments == 'true'){
        passage.comment = true;
        passage.forum = true;
        passage.label = "Comment";
    }
    if(req.body.comments != 'true'){
        passage.label = formData.label;
    }
    if(!passageController.labelOptions.includes(passage.label)){
        return res.send("Not an option.");
    }
    switch(passage.label){
        case 'Project':
        case 'Idea':
        case 'Database':
        case 'Article':
            passage.public = false;
            passage.forum = false;
            break;
        case 'Social':
        case 'Question':
        case 'Comment':
        case 'Task':
        case 'Challenge':
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
    passage.html = formData.html;
    console.log("HTML"+ passage.html);
    passage.css = formData.css;
    passage.javascript = formData.js;
    passage.title = formData.title;
    passage.content = formData.content;
    passage.tags = formData.tags;
    passage.code = formData.code;
    passage.bibliography = formData.bibliography;
    passage.lang = formData.lang;
    passage.fileStreamPath = formData.filestreampath;
    passage.previewLink = formData['editor-preview'];
    if(parent != null && !passage.public && parent.author._id.toString() == req.session.user._id.toString()){
        if(parent.sameUsers){
            console.log("Same users");
            passage.users = parent.users;
        }
        if(parent.sameCollabers){
            console.log("Same collabers");
            passage.collaborators = parent.collaborators;
        }
        if(parent.sameSources){
            console.log("Same sources");
            passage.sourceList = parent.sourceList;
            passage.bibliography = parent.bibliography;
        }
    }
    //no longer synthetic if it has been edited
    passage.synthetic = false;
    var uploadTitle = '';
    if (!req.files || Object.keys(req.files).length === 0) {
        //no files uploaded
        console.log("No files uploaded.");
        passage.filename = passage.filename;
    }
    else{
        console.log('File uploaded');
        await uploadFile(req, res, passage);
    }
    await passage.save();
    //create notification if making a sub passage
    if(chief !== 'root'){
        for(const user of parent.watching){
            await Notification.create({
                for: user,
                about: req.session.user,
                passage: passage,
                content: '<a href="/profile/'+req.session.user.name+'">' + req.session.user.name + '</a> created "' + passageController.handlePassageLink(passage) + '" in "' + passageController.handlePassageLink(parent) + '"'
            });
        }
    }
    if(passage.mainFile && req.session.user.admin){
        //also update file and server
        updateFile(passage.fileStreamPath, passage.code);
    }
    await passageController.afterPassageCreation(newPassage);
    passage = await passageController.getPassage(passage);
    if(formData.page == 'stream'){
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage:true});
    }
    else if(formData.page == 'forum' && formData.which != 'thread'){
        console.log(req.body.chief);
        passage.numViews = await scripts.getNumViews(passage._id);
        if(passage.passages && passage.passages.length > 0){
            passage.lastPost = 'by ' + passage.passages.at(-1).author.name + '<br>' + passage.passages.at(-1).date.toLocaleDateString();
        }else{
            passage.lastPost = 'No Posts Yet.';
        }
        return res.render('cat_row', {subPassages: false, topic: passage, sub: true});
    }
    else{
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: true});
    }
});

// Update routes

router.post(/\/delete_passage\/?/, passageController.deletePassage);

// Update passage order route - from sasame.js line 7039
router.post('/update_passage_order/', async (req, res) => {
    let passage = await Passage.findOne({_id: req.body._id});
    //Only for private passages
    if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        var passageOrder = [];
        if(typeof req.body.passageOrder != 'undefined'){
            var passageOrder = JSON.parse(req.body.passageOrder);
            let trimmedPassageOrder = passageOrder.map(str => str.trim());
            console.log(trimmedPassageOrder);
            passage.passages = trimmedPassageOrder;
            passage.markModified('passages');
            await passage.save();
        }
    }
    //give back updated passage
    res.send('Done');
});

// Update passage route - from sasame.js line 7263 (truncated but with proper imports)
router.post('/update_passage/', async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var formData = req.body;
    var subforums = formData.subforums;
    var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
    if(passage.author._id.toString() != req.session.user._id.toString() && !req.session.user.admin){
        return res.send("You can only update your own passages.");
    }
    else if(passage.public_daemon == 2 || passage.default_daemon){
        return res.send("Not allowed.");
    }
    if(passage.versionOf != null){
        return res.send("Not allowed.");
    }
    //if the passage has changed (formdata vs passage)
    //save the old version in a new passage
    if(formData.html != passage.html || formData.css != passage.css || formData.javascript
        != passage.javascript || formData.code != passage.code || formData.content
        != passage.content){
        var oldVersion = await Passage.create({
            parent: null,
            author: passage.author,
            date: passage.updated,
            versionOf: passage._id,
            users: passage.users,
            sourceList: passage.sourceList,
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
            synthetic: false,
            mirror: passage.mirror,
            bestOf: passage.bestOf,
            mirrorEntire: passage.mirrorEntire,
            mirrorContent: passage.mirrorContent,
            bestOfEntire: passage.bestOfEntire,
            bestOfContent: passage.bestOfContent,
            public: passage.public,
            forum: passage.forum,
            previewLink: passage.previewLink,
            yt: passage.yt
        });
        //now add to versions of new passage
        passage.versions.push(oldVersion);
    }
    passage.yt = formData.yt;
    passage.html = formData.html;
    passage.css = formData.css;
    passage.javascript = formData.js;
    passage.title = formData.title;
    passage.content = formData.content;
    passage.tags = formData.tags;
    passage.code = formData.code;
    passage.bibliography = formData.bibliography;
    passage.lang = formData.lang;
    passage.fileStreamPath = formData.filestreampath;
    passage.previewLink = formData['editor-preview'];
    //no longer synthetic if it has been edited
    passage.synthetic = false;
    passage.lastUpdated = Date.now();
    var uploadTitle = '';
    if (!req.files || Object.keys(req.files).length === 0) {
        //no files uploaded
        console.log("No files uploaded.");
        passage.filename = passage.filename;
    }
    else{
        console.log('File uploaded');
        await uploadFile(req, res, passage);
    }
    if(subforums == 'true'){
        console.log(3);
    }
    //Only for private passages
    if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        var passageOrder = [];
        if(req.body.passageOrder != 'false' && req.body.isChief != 'false'){
            var passageOrder = JSON.parse(req.body.passageOrder);
            let trimmedPassageOrder = passageOrder.map(str => str.trim());
            console.log(trimmedPassageOrder);
            if(subforums == 'true'){
                console.log(2);
                passage.subforums = trimmedPassageOrder;
                passage.markModified('subforums');
            }
            else{
                passage.passages = trimmedPassageOrder;
                passage.markModified('passages');
            }
        }
    }
    passage.markModified('versions');
    await passage.save();
    if(passage.mainFile && req.session.user.admin){
        //also update file and server
        // updateFile(passage.fileStreamPath, passage.code);
    }
    passage = await passageController.getPassage(passage);
    var subPassage = formData.parent == 'root' ? false : true;
    //give back updated passage
    return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
});

// Copy and share routes

// Share passage route - from sasame.js line 1345
router.post('/share_passage', async(req, res) => {
    res.send(await passageController.sharePassage(req.session.user._id, req.body.passageId, req.body.username));
});

// Copy passage route (currently commented out in sasame.js)
router.post('/copy_passage/', async (req, res) => {
    res.json({ message: 'Copy passage functionality to be implemented' });
});

// Settings and collaboration

// Passage setting route - from sasame.js line 3592
router.post('/passage_setting', async (req, res) => {
    let _id = req.body._id;
    let setting = req.body.setting;
    let user = await User.findOne({_id: req.session.user._id});
    let passage = await Passage.findOne({_id: _id}).populate('author');
    switch(setting){
        case 'private':
            if(passage.author._id.toString() == user._id.toString()){
                passage.public = !passage.public;
            }
            break;
        case 'public':
            if(passage.author._id.toString() == user._id.toString()){
                passage.public = !passage.public;
            }
            break;
        case 'forum':
            if(passage.author._id.toString() == user._id.toString()){
                passage.forum = !passage.forum;
            }
            break;
        case 'personal':
            if(passage.author._id.toString() == user._id.toString()){
                passage.personal = !passage.personal;
            }
            break;
        case 'cross-origin-allowed':
            if(passage.author._id.toString() == user._id.toString()){
                passage.personal_cross_origin = !passage.personal_cross_origin;
            }
            break;
        case 'request-public-daemon':
            if(passage.author._id.toString() == user._id.toString()){
                passage.public_daemon = 1;
            }
            break;
        case 'admin-make-public-daemon':
            if(user.admin){
                passage.public_daemon == 2 ? 1 :  2;
            }
            break;
        case 'admin-make-default-daemon':
            if(user.admin){
                passage.default_daemon = !passage.default_daemon;
            }
            break;
        case 'distraction-free':
            if(passage.author._id.toString() == user._id.toString()){
                passage.distraction_free = !passage.distraction_free;
            }
            break;
        case 'bubbling':
            if(passage.author._id.toString() == user._id.toString()){
                passage.bubbling = !passage.bubbling;
            }
            break;
    }
    await passage.save();
    res.send("Done")
});

// Add collaborator route - from sasame.js line 3563
router.post('/add_collaborator', async (req, res) => {
    var passage = await Passage.findOne({_id: req.body.passageID});
    if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        var collaborator = await User.findOne({username:req.body.username});
        if(collaborator == null){
            return res.send("Collaborator not found.");
        }
        console.log(collaborator._id.toString());
        console.log(req.session.user._id.toString());
        console.log(collaborator._id.toString() != req.session.user._id.toString());
        if(!passage.collaborators.includes(collaborator._id.toString()) && collaborator._id.toString() != req.session.user._id.toString()){
            passage.collaborators.push(collaborator._id.toString());
            passage.markModified('collaborators');
        }else{
            return res.send("Not allowed. Can't add author or user already added.");
        }
        await passage.save();
        return res.send("Collaborator Added");
    }
    else{
        return res.send("Wrong permissions.");
    }
});

// Remove collaborator route - from sasame.js line 3716
router.post('/remove_collaber', async (req, res) => {
    let passageID = req.body.passageID;
    let userID = req.body.userID;
    let passage = await Passage.findOne({_id: passageID});
    if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        var index = 0;
        for(const u of passage.collaborators){
            if(u == userID){
                //remove user
                passage.collaborators.splice(index, 1);
            }
            ++index;
        }
        passage.markModified('collaborators');
        await passage.save();
        res.send("Done.");
    }
});

// Install passage route - from sasame.js line 8058
router.post('/install_passage', async function(req, res){
    const fsp = require('fs').promises;
    var passage = await Passage.findOne({_id: req.body._id});
    var directory = getDirectoryStructure(passage);
    await decodeDirectoryStructure(directory);
    res.send("Done")
});

// Passage from JSON route - from sasame.js line 1863
router.post('/passage_from_json', async (req, res) => {
    //copy passage
    var copy = passageController.copyPassage(req.params.passage, [req.session.user], null, function(){
        
    });
    await createBookmark(copy._id, req.session.user._id);
});

module.exports = router;