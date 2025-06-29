'use strict';

const { Passage, PassageSchema } = require('../models/Passage');
const bookmarkService = require('../services/bookmarkService');
const passageService = require('../services/passageService');
const { User } = require('../models/User');
const Message = require('../models/Message');
const Follower = require('../models/Follower');
const { deleteOldUploads } = require('../services/fileService');
const { getRedisClient, getRedisOps, isRedisReady } = require('../config/redis');
//Call in Scripts
const { scripts } = require('../common-utils');
const browser = require('browser-detect');
var fs = require('fs'); 

// Constants
const DOCS_PER_PAGE = 10; 

async function deletePassage(req, res) {
    var passage = await Passage.findOne({_id: req.body._id});
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("Only passage author can delete.");
    }
    if(passage.versionOf != null){
        return res.send("Not allowed.");
    }
    await passageService.deletePassage(passage);
    return res.send("Deleted.");
}

async function watch(req, res) {
    var passage = await Passage.findOne({_id: req.body.passage.toString()});
    // console.log('what'+passage);
    if(!passage.watching.includes(req.session.user._id)){
        passage.watching.push(req.session.user._id);
    }
    else{
        passage.watching = passage.watching.filter(function(person){
            if(person._id == req.session.user._id){
                return false;
            }
            return true;
        });
    }
    passage.markModified('watching');
    await passage.save();
    return res.send("Done");
}

async function postsPage(req, res) {
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    const page = parseInt(req.query.page || '1');
    const limit = DOCS_PER_PAGE;
    if(req.session.CESCONNECT){
        getRemotePage(req, res);
    }
    else{
        try {
        // Generate feed for guest users
        const feedResult = await passageService.generateGuestFeed(page, limit);
        
        // Check if we need to redirect (e.g., page number is beyond available results)
        if (feedResult.redirect) {
          return res.redirect(`/discover?page=${feedResult.page}`);
        }
        
        // Process each passage to get complete data
        const passages = [];
        for (let i = 0; i < feedResult.feed.length; i++) {
          const processedPassage = await passageService.getPassage(feedResult.feed[i]);
          passages.push(processedPassage);
        }
        
        // Render the feed page
        return res.render("stream", {
          subPassages: false,
          passageTitle: false, 
          scripts: scripts, 
          passages: passages, 
          passage: {
            id: 'root', 
            author: {
              _id: 'root',
              username: 'Sasame'
            }
          },
          ISMOBILE: ISMOBILE,
          page: 'posts',
          whichPage: 'stream',
          thread: false,
          currentPage: feedResult.currentPage,
          totalPages: feedResult.totalPages
        });
      } catch (error) {
        console.error('Error generating guest feed:', error);
        return res.status(500).send('Error generating feed. Please try again later.');
      }
    }
}
//sort arr to match to
function sortArray(arr, to){
    var reordered = Array(arr.length).fill(0);
    for(var i = 0; i < to.length; ++i){
        for(var j = 0; j < arr.length; ++j){
            if(arr[j]._id.toString() == to[i]._id.toString()){
                reordered[i] = arr[j];
            }
        }
    }
    reordered = reordered.filter(x => x !== 0);
    return reordered;
}
async function forumPage(req, res) {
    // await clearForum();
    // await fillForum(req);
    let bookmarks = [];
    if(req.session.user){
        bookmarks = bookmarkService.getBookmarks(req.session.user);
    }
    var infinity = await Passage.findOne({forumType: 'header'});
    var categories = await Passage.find({forumType: 'category'});
    var subcats = await Passage.find({forumType: 'subcat'}).populate('passages.author');
    var subforums = await Passage.find({forumType: 'subforum'});
    //get categories and subofrums in order as sorted
    var header = await Passage.findOne({forumType: 'header'});
    categories = sortArray(categories, infinity.passages);
    categories = categories.filter(function(value, index, array){
        return (value.title == 'VIP' || value.title == 'Admins') ? false : true;
    });
    var sortedSubcats = [];
    //sort subcats
    //get list of all subcats in order from category passages
    for(const cat of categories){
        for(const c of cat.passages){
            sortedSubcats.push(c);
        }
    }
    subcats = sortArray(subcats, sortedSubcats);
    var sortedSubforums = [];
    //sort subforums
    //get list of all subforums in order from subcat passages
    for(const sub of subcats){
        for(const s of sub.subforums){
            sortedSubforums.push(s);
        }
    }
    subforums = sortArray(subforums, sortedSubforums);
    if(req.query._id){
        return res.render("forum_body", {
            scripts: scripts,
            bookmarks: bookmarks,
            categories: categories,
            subcats: subcats,
            subforums: subforums,
        });
    }
    res.render("forum", {
        scripts: scripts,
        bookmarks: bookmarks,
        categories: categories,
        subcats: subcats,
        subforums: subforums,
    });
    // await Subforum.deleteMany({});
    // fillForum();
}

async function personalPage(req, res) {
    if(!req.session.user || req.session.user._id != req.params.user_id){
        return res.redirect('/');
    }
    else{
        var passages = await Passage.find({
            //author: req.params.user_id, 
            personal: true,
            users: {
                $in: [req.params.user_id]
            }
        }).populate('author users sourcelist collaborators versions parent').limit(DOCS_PER_PAGE);
        for(var i = 0; i < passages.length; ++i){
            passages[i] = await passageService.getPassage(passages[i]);
        }
        let bookmarks = [];
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
        // }
        if(req.session.user){
            bookmarks = bookmarkService.getBookmarks(req.session.user);
        }
        passages = await passageService.fillUsedInList(passages);
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        return res.render("stream", {
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passages: passages, 
            page: 'personal',
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            bookmarks: bookmarks,
            ISMOBILE: ISMOBILE,
            whichPage: 'personal'
        });
    }
}

async function feedPage(req, res) {
    if (!req.session.user) {
      return res.redirect('/loginform');
    }

    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    const page = parseInt(req.query.page || '1');
    const limit = DOCS_PER_PAGE;
    
    try {
      // Get feed with pagination
      const result = await passageService.generateFeedWithPagination(req.session.user, page, limit);
      
      // If we need to redirect to a different page (e.g., if requested page is beyond results)
      if (result.redirect) {
        return res.redirect(`/feed?page=${result.page}`);
      }
      
      // Process passages with getPassage to get all required data
      const passages = [];
      for (let i = 0; i < result.feed.length; i++) {
        const processedPassage = await passageService.getPassage(result.feed[i]);
        passages.push(processedPassage);
      }
      
      // Get bookmarks for sidebar
      let bookmarks = [];
      if (req.session.user) {
        bookmarks = await bookmarkService,getBookmarks(req.session.user);
      }
      
      // Render the stream view with feed data
      return res.render("stream", {
        subPassages: false,
        passageTitle: false, 
        scripts: scripts, 
        passages: passages, 
        passage: {
          id: 'root', 
          author: {
            _id: 'root',
            username: 'Sasame'
          }
        },
        bookmarks: bookmarks,
        ISMOBILE: ISMOBILE,
        page: 'feed',
        whichPage: 'feed',
        thread: false,
        currentPage: result.currentPage,
        totalPages: result.totalPages
      });
    } catch (error) {
      console.error('Error generating feed:', error);
      return res.status(500).send('Error generating feed. Please try again later.');
    }
}

async function getPassage(req, res) {
    //run authentication for personal passages
    var passage = await Passage.findOne({_id: req.query._id})
    if(!passage.personal || (passage.personal && req.session.user._id.toString() == passage.author._id.toString())){
        return res.send(JSON.stringify(passage));
    }
    else{
        return res.send('Improper Credentials.');
    }
}

async function passageForm(req, res) {
    res.render('passage_form');
}

async function createPassage(req, res) {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    let user = req.session.user || null;
    var newPassage = await passageService.createPassage(user, req.body.passageID);
    res.render('passage', {subPassages: false, passage: newPassage, sub: true});
}

async function createInitialPassage(req, res) {
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
    var newPassage = await passageService.createPassage(user, chief.toString(), req.body.subforums, req.body.comments, customDate, isSimulated);
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
    if(!passageService.labelOptions.includes(passage.label)){
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
                content: '<a href="/profile/'+req.session.user.name+'">' + req.session.user.name + '</a> created "' + passageService.handlePassageLink(passage) + '" in "' + passageService.handlePassageLink(parent) + '"'
            });
        }
    }
    if(passage.mainFile && req.session.user.admin){
        //also update file and server
        updateFile(passage.fileStreamPath, passage.code);
    }
    await passageService.afterPassageCreation(newPassage);
    passage = await passageService.getPassage(passage);
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
}

async function updatePassageOrder(req, res) {
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
}

async function updatePassage(req, res) {
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
    passage = await passageService.getPassage(passage);
    var subPassage = formData.parent == 'root' ? false : true;
    //give back updated passage
    return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
}

async function sharePassage(req, res) {
    res.render('passage_form');
}
async function copyPassage(req, res) {
    res.send(await passageService.sharePassage(req.session.user._id, req.body.passageId, req.body.username));
}
async function setPassageSetting(req, res) {
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
    res.send("Done");
}
async function addCollaborator(req, res) {
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
}
async function removeCollaber(req, res) {
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
}
async function installPassage(req, res) {
    const fsp = require('fs').promises;
    var passage = await Passage.findOne({_id: req.body._id});
    var directory = getDirectoryStructure(passage);
    await decodeDirectoryStructure(directory);
    res.send("Done");
}
async function passageFromJSON(req, res) {
    res.render('passage_form');
}
async function thread(req, res) {
    // ALT
    var bigRes = await passageService.getBigPassage(req, res);
    await passageService.logVisit(req, bigRes.passage._id);
    if(!res.headersSent){
        await passageService.getRecursiveSpecials(bigRes.passage);
        res.render("thread", {subPassages: bigRes.passage.passages, passageTitle: bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: true,
            parentID: bigRes.parentID,
            topicID: bigRes.passage._id,
            subPassage: true
        });
    }
}
async function cat(req, res) {
    var pNumber = req.query.pNumber;
    var search = req.query.search || '';
    var find = {
        parent: req.query._id.toString(),
        title: {$regex:search,$options:'i'},
        // $or: [
        //     {title: {$regex:search,$options:'i'}},
        //     {content: {$regex:search,$options:'i'}},
        //     {code: {$regex:search,$options:'i'}},
        // ],
    };
    if(search == ''){
        find = {
            parent: req.query._id.toString()
        };
    }
    var parent = await Passage.findOne({_id: req.query._id});
    var topics = await Passage.paginate(find, {sort: '-date', page: pNumber, limit: 20, populate: 'passages.author'});
    var totalDocuments = await Passage.countDocuments(find);
    var totalPages = Math.floor(totalDocuments/20) + 1;
    for (const topic of topics.docs){
        topic.numViews = await scripts.getNumViews(topic._id);
        if(topic.passages && topic.passages.length > 0){
            topic.lastPost = 'by ' + topic.passages.at(-1).author.name + '<br>' + topic.passages.at(-1).date.toLocaleDateString();
        }else{
            topic.lastPost = 'No Posts Yet.';
        }
    }
    topics = topics.docs;
    var stickieds = await Passage.find({parent:req.query._id.toString(), stickied: true});
    return res.render('cat', {
        _id: parent._id,
        name: parent.title,
        topics: topics,
        postCount: topics.length,
        totalPages: totalPages,
        stickieds: stickieds
    });
    // var s = false;
    // var categories = await Passage.find({forumType: 'category'});
    // var subcats = await Passage.find({forumType: 'subcat'});
    // var subforums = await Passage.find({forumType: 'subforum'});
    // var focus;
    // if(req.query.s){
    //     s = true;
    //     var subForum = await Passage.findOne({_id: req.query.s});
    // }
    // if(s == false){
    //     var topics = await Passage.find({
    //         parent: req.query.f,
    //         sub: false
    //     });
    // }
    // else{
    //     var topics = await Passage.find({
    //         parent: req.query.s,
    //         sub: true
    //     });
    // }
    // console.log(req.query);
    // if(!req.query.f && !req.query.s){
    //     console.log('TEST2');
    //     return res.render("forum_body", {
    //         categories: categories,
    //         subcats: subcats,
    //         subforums: subforums
    //     });
    // }
    // var parent = await Passage.findOne({_id: req.query.f});
    // res.render('cat', {
    //     name: subForum ? subForum.title : false || parent.title || '',
    //     topics: topics,
    //     postCount: topics.length
    // })
}


module.exports = {
    deletePassage,
    getPassage,
    postsPage,
    forumPage,
    personalPage,
    feedPage,
    passageForm,
    createPassage,
    createInitialPassage,
    updatePassageOrder,
    updatePassage,
    sharePassage,
    copyPassage,
    setPassageSetting,
    addCollaborator,
    removeCollaber,
    installPassage,
    passageFromJSON,
    watch,
    thread,
    cat
};