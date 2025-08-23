'use strict';

const { Passage, PassageSchema } = require('../models/Passage');
const bookmarkService = require('../services/bookmarkService');
const passageService = require('../services/passageService');
const { User } = require('../models/User');
const Message = require('../models/Message');
const Reward = require('../models/Reward');
const Team = require('../models/Team');
const Follower = require('../models/Follower');
const { deleteOldUploads, uploadFile } = require('../services/fileService');
const { getRedisClient, getRedisOps, isRedisReady } = require('../config/redis');
//Call in Scripts
const { scripts, DOCS_PER_PAGE, labelOptions } = require('../common-utils');
const browser = require('browser-detect');
var fs = require('fs'); 
const mongoose = require('mongoose');

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
    const passageId = req.body.passage.toString();
    const userId = req.session.user._id;
    
    // First check if user is already watching
    const passage = await Passage.findOne({_id: passageId});
    const isWatching = passage.watching.some(person => person._id.toString() === userId.toString());
    
    if(!isWatching){
        // Add user to watching list
        await Passage.updateOne(
            { _id: passageId },
            { $push: { watching: userId } }
        );
    }
    else{
        // Remove user from watching list
        await Passage.updateOne(
            { _id: passageId },
            { $pull: { watching: userId } }
        );
    }
    
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
        
        // Check if user can create products
        let canCreateProducts = false;
        if (req.session.user) {
            canCreateProducts = await scripts.canCreateProducts(req.session.user);
        }
        
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
            whichPage: 'personal',
            canCreateProducts: canCreateProducts
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
        bookmarks = await bookmarkService.getBookmarks(req.session.user);
      }
      
      // Check if user can create products
      let canCreateProducts = false;
      if (req.session.user) {
        canCreateProducts = await scripts.canCreateProducts(req.session.user);
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
        totalPages: result.totalPages,
        canCreateProducts: canCreateProducts
      });
    } catch (error) {
      console.error('Error generating feed:', error);
      return res.status(500).send('Error generating feed. Please try again later.');
    }
}

async function getPassageJSON(req, res) {
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
    var formData = req.body;
    if(req.body.whichPage === 'market' || formData.label === 'Product'){
        var checkUser = await User.findOne({_id:req.session.user._id.toString()});
        if(!(await scripts.canCreateProducts(checkUser))){
            return res.send("You must verify more information to create a product.");
        }
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
    if(newPassage == 'Not allowed.' || newPassage == 'Must be on userlist.' || newPassage == 'Can not add to or modify public daemon.'){
        return res.send(newPassage);
    }
    //update passage
    var repost = req.body.repost == 'true' ? true : false;
    var repostID = req.body['repost-id'];
    var passage = await Passage.findOne({_id: newPassage._id}).populate(passageService.standardPopulate);
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
    if(req.body.whichPage == 'market'){
        passage.label = 'Product';
    }
    if(passage.label == 'Product'){
        passage.price = formData.price;
        passage.inStock = formData.stock;
        if(req.body['unlimited-stock'] == 'on'){
            passage.inStock = Infinity;
        }
        if(passage.price < 1){
            return res.send("Price must be greater than or equal to $1.");
        }
    }
    if(!labelOptions.includes(passage.label)){
        return res.send("Not an option.");
    }
    passageService.updateLabel(passage);
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
    var sourceList = formData.sourceList;
    if(sourceList.length > 0){
        sourceList = sourceList.split(',');
        for(const source of sourceList){
            if(mongoose.Types.ObjectId.isValid(source)){
                passage.sourceList.push(source);
            }
        }
    }

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
    passage.chain = await passageService.getChain(passage);
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
    // Reload passage from database with proper population before calling getPassage
    passage = await Passage.findById(passage._id).populate(passageService.standardPopulate);
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
    // First verify the passage exists and user has permission
    let passage = await Passage.findOne({_id: req.body._id});
    
    //Only for private passages
    if(passage && passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        if(typeof req.body.passageOrder != 'undefined'){
            var passageOrder = JSON.parse(req.body.passageOrder);
            let trimmedPassageOrder = passageOrder.map(str => str.trim());
            console.log(trimmedPassageOrder);
            
            // Use atomic update
            await Passage.updateOne(
                { _id: req.body._id },
                { $set: { passages: trimmedPassageOrder } }
            );
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
    var price = formData.price;
    if(price < 1){
        return res.send("Price must be greater than or equal to $1.");
    }
    var inStock = formData.stock;
    if(req.body['unlimited-stock'] == 'on'){
        inStock = Infinity;
    }
    if(formData.label === 'Product'){
        var checkUser = await User.findOne({_id:req.session.user._id.toString()});
        if(!checkUser.identityVerified || !checkUser.stripeOnboardingComplete){
            return res.send("You must have your identity verified and your payment options setup to create a product.");
        }
    }
    // Prepare update object
    const updateData = {
        $set: {
            yt: formData.yt,
            html: formData.html,
            css: formData.css,
            javascript: formData.js,
            title: formData.title,
            content: formData.content,
            tags: formData.tags,
            code: formData.code,
            bibliography: formData.bibliography,
            lang: formData.lang,
            fileStreamPath: formData.filestreampath,
            previewLink: formData['editor-preview'],
            synthetic: false,
            lastUpdated: Date.now(),
            price: price,
            inStock: inStock,
            sortedBy: null
        }
    };
    
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
        updateData.$push = { versions: oldVersion._id };
    }
    
    // Handle file uploads
    if (req.files && Object.keys(req.files).length > 0) {
        console.log('File uploaded');
        await uploadFile(req, res, passage);
    }
    
    //Only for private passages
    if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        if(req.body.passageOrder != 'false' && req.body.isChief != 'false'){
            var passageOrder = JSON.parse(req.body.passageOrder);
            let trimmedPassageOrder = passageOrder.map(str => str.trim());
            console.log(trimmedPassageOrder);
            if(subforums == 'true'){
                console.log(2);
                updateData.$set.subforums = trimmedPassageOrder;
            }
            else{
                updateData.$set.passages = trimmedPassageOrder;
            }
        }
    }
    
    // Perform atomic update
    await Passage.updateOne({ _id: _id }, updateData);
    
    if(passage.mainFile && req.session.user.admin){
        //also update file and server
        // updateFile(passage.fileStreamPath, passage.code);
    }
    
    // Fetch updated passage
    passage = await passageService.getPassage(await Passage.findOne({_id: _id}));
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
    
    // Prepare update object
    const updateData = {};
    
    switch(setting){
        case 'private':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.public = !passage.public;
            }
            break;
        case 'public':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.public = !passage.public;
            }
            break;
        case 'forum':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.forum = !passage.forum;
            }
            break;
        case 'personal':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.personal = !passage.personal;
            }
            break;
        case 'cross-origin-allowed':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.personal_cross_origin = !passage.personal_cross_origin;
            }
            break;
        case 'request-public-daemon':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.public_daemon = 1;
            }
            break;
        case 'admin-make-public-daemon':
            if(user.admin){
                updateData.public_daemon = passage.public_daemon == 2 ? 1 : 2;
            }
            break;
        case 'admin-make-default-daemon':
            if(user.admin){
                updateData.default_daemon = !passage.default_daemon;
            }
            break;
        case 'distraction-free':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.distraction_free = !passage.distraction_free;
            }
            break;
        case 'bubbling':
            if(passage.author._id.toString() == user._id.toString()){
                updateData.bubbling = !passage.bubbling;
            }
            break;
    }
    
    // Only update if there's something to update
    if(Object.keys(updateData).length > 0) {
        await Passage.updateOne(
            { _id: _id },
            { $set: updateData }
        );
    }
    
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
            // Use atomic update to add collaborator
            await Passage.updateOne(
                { _id: req.body.passageID },
                { $push: { collaborators: collaborator._id.toString() } }
            );
            return res.send("Collaborator Added");
        }else{
            return res.send("Not allowed. Can't add author or user already added.");
        }
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
        // Use atomic update to remove collaborator
        await Passage.updateOne(
            { _id: passageID },
            { $pull: { collaborators: userID } }
        );
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
async function removeSource(req, res) {
    let passageID = req.body.passageID;
    let sourceID = req.body.sourceID;
    let passage = await Passage.findOne({_id: passageID});
    if(req.session.user && (req.session.user._id.toString() == passage.author._id.toString() || req.session.user.admin)){
        // Use atomic update to remove source
        await Passage.updateOne(
            { _id: passageID },
            { $pull: { sourceList: sourceID } }
        );
        //if passage.parent has a reward and passage is in first place or the selected answer
        //remove reward from all users who are contributors to source but not to passage
        //if the reward is for selected answer only don't take away from contributor if they are equal to passage.parent.author as they
        //never got the reward in the first place
        if(passage.parent.reward > 0 && (passage.selectedAnswer || passage.inFirstPlace)){
            var source = await Passage.findOne({_id: sourceID});
            var passageSourceList = await passageService.getRecursiveSourceList(passage.sourceList, [], passage);
            var passageContributors = passageService.getAllContributors(passage, sourceList);
            var sourceSourceList = await passageService.getRecursiveSourceList(source.sourceList, [], source);
            var sourceContributors = passageService.getAllContributors(source, sourceList);
            //get all source contributors that are not existing contributors to passage
            elementsNotInPassageSourceList = sourceContributors.filter(element => !passageContributors.includes(element));
            var contributorsToRemoveRewardFrom = elementsNotInPassageSourceList;
            // Build bulk operations for contributors to remove reward from
            const bulkOps = contributorsToRemoveRewardFrom
                .filter(contributor => {
                    // if the reward is for selected answer: dont give if contributor == parent.parent.author
                    // if the reward is for most stars, it's okay for contributor to have created the challenge
                    // if the reward is for both it is also okay
                    return !(parent.selectedAnswer && !parent.inFirstPlace && contributor === parent.parent.author._id.toString());
                })
                .map(contributor => ({
                    updateOne: {
                        filter: { _id: contributor },
                        update: { $inc: { starsGiven: -passage.parent.reward } }
                    }
                }));
            
            // Execute bulk write if there are operations
            if(bulkOps.length > 0){
                await User.bulkWrite(bulkOps);
            }
        }
        res.send("Done.");
    }
}
async function passage(req, res) {
    if(req.session.CESCONNECT){
            return systemService.getRemotePage(req, res);
        }
    var bigRes = await passageService.getBigPassage(req, res, true);
    // console.log('TEST'+bigRes.passage.title);
    // bigRes.passage = await fillUsedInListSingle(bigRes.passage);
    // console.log('TEST'+bigRes.passage.usedIn);
    if(!res.headersSent){
        // var location = ['test'];
        var location = await passageService.getPassageLocation(bigRes.passage);
        await passageService.getRecursiveSpecials(bigRes.passage);
        console.log(bigRes.subPassages);
        
        // Check if user can create products
        let canCreateProducts = false;
        if (req.session.user) {
            canCreateProducts = await scripts.canCreateProducts(req.session.user);
        }
        
        return res.render("stream", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title == '' ? 'Untitled' : bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: false,
            page: 'more',
            whichPage: 'sub',
            location: location,
            canCreateProducts: canCreateProducts
        });
    }
}
async function changeLabel(req, res){
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var passage = await Passage.findOne({_id: _id}).populate('author');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    
    const label = req.body.label;
    if(label === 'Product'){
        var checkUser = await User.findOne({_id:req.session.user._id.toString()});
        if(!checkUser.identityVerified || !checkUser.stripeOnboardingComplete){
            return res.send("You must have your identity verified and your payment options setup to create a product.");
        }
    }
    if(!labelOptions.includes(label)){
        return res.send("Not an option.");
    }
    
    // Prepare update data
    const updateData = { label: label };
    
    passageService.updateLabel(updateData);
    
    // Use atomic update
    await Passage.updateOne(
        { _id: _id },
        { $set: updateData }
    );
    
    passage = await passageService.getPassage(await Passage.findOne({_id: _id}));
    var subPassage = req.body.parent == 'root' ? false : true;
    return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
}
async function _eval(req, res){
    if(req.session.CESCONNECT){
        return getRemotePage(req, res);
    }
    var passage_id = req.params.passage_id;
    var passage = await Passage.findOne({_id: passage_id});
    if(passage !== null){
        passage.all = '';
    }
    // console.log(passage);
    //stick together code for all sub passages
    var all = {
        html: passage.html,
        css: passage.css,
        javascript: passage.javascript
    };
    if(passage.lang == 'daemon'){
        all.javascript = passage.code;
    }
    var userID = null;
    if(req.session.user){
        userID = req.session.user._id.toString();
    }
    all.javascript = passageService.DAEMONLIBS(passage, userID) + all.javascript;
    if(!passage.public){
        passage.code = passageService.DAEMONLIBS(passage, userID) + passage.code;
        passage = await passageService.getPassage(passage);
    }
    res.render("eval", {passage: passage, all: all});
}
// Add user to passage
const addUser = async (req, res) => {
    let passageId = req.body.passageId;
    let username = req.body.username;
    let user = await User.findOne({username: username});
    let passage = await Passage.findOne({_id: passageId});
    if(user && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        // Use atomic update to add user
        await Passage.updateOne(
            { _id: passageId },
            { $push: { users: user._id.toString() } }
        );
        res.send("User Added");
    }
    else{
        res.send("User not found.");
    }
};
// Remove user from passage
const removeUser = async (req, res) => {
    let passageID = req.body.passageID;
    let userID = req.body.userID;
    let passage = await Passage.findOne({_id: passageID});
    if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        // Use atomic update to remove user
        await Passage.updateOne(
            { _id: passageID },
            { $pull: { users: userID } }
        );
        res.send("Done.");
    }
};

// Show best-of toggle
const showBestOf = async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var passage = await Passage.findOne({_id: _id}).populate('author');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    console.log(req.body.checked);
    
    // Use atomic update
    await Passage.updateOne(
        { _id: _id },
        { $set: { showBestOf: req.body.checked } }
    );
    
    passage = await passageService.getPassage(await Passage.findOne({_id: _id}));
    var subPassage = req.body.parent == 'root' ? false : true;
    return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
};

// Same users setting
const sameUsers = async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var passage = await Passage.findOne({_id: _id}).populate('author');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    
    // Use atomic update
    await Passage.updateOne(
        { _id: _id },
        { $set: { sameUsers: req.body.checked } }
    );
    
    return res.send("Complete.");
};

// Same collaborators setting
const sameCollabers = async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var passage = await Passage.findOne({_id: _id}).populate('author');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    
    // Use atomic update
    await Passage.updateOne(
        { _id: _id },
        { $set: { sameCollabers: req.body.checked } }
    );
    
    return res.send("Complete.");
};

// Same sources setting
const sameSources = async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    var _id = req.body._id;
    var passage = await Passage.findOne({_id: _id}).populate('author');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    
    // Use atomic update
    await Passage.updateOne(
        { _id: _id },
        { $set: { sameSources: req.body.checked } }
    );
    
    return res.send("Complete.");
};

// Update mirroring settings
const updateMirroring = async (req, res) => {
    let passage = await Passage.findOne({_id: req.body._id});
    if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        let mirror = null;
        let bestOf = null;
        
        try{
            mirror = await Passage.findOne({_id:req.body.mirror.trim()});
        }
        catch(e){
            console.log("Null value");
        }
        try{
            bestOf = await Passage.findOne({_id:req.body.bestOf.trim()});
        }
        catch(e){
            console.log("Null value");
        }
        
        // Prepare update data
        const updateData = {
            mirror: mirror ? mirror._id : null,
            bestOf: bestOf ? bestOf._id : null,
            mirrorContent: req.body.mirrorContent,
            mirrorEntire: req.body.mirrorEntire,
            bestOfContent: req.body.bestOfContent,
            bestOfEntire: req.body.bestOfEntire
        };
        
        // Use atomic update
        await Passage.updateOne(
            { _id: req.body._id },
            { $set: updateData }
        );
        
        return res.send("Done.");
    }
    else{
        return res.send("Not your passage.");
    }
};

// Sticky toggle
const sticky = async (req, res) => {
    var passage = await Passage.findOne({_id: req.body._id});
    // Use atomic update to toggle stickied status
    await Passage.updateOne(
        { _id: req.body._id },
        { $set: { stickied: !passage.stickied } }
    );
    return res.send("Done.");
};

// Comments view
const comments = async (req, res) => {
    const systemService = require('../services/systemService');
    if(req.session.CESCONNECT){
        return systemService.getRemotePage(req, res);
    }
    var bigRes = await passageService.getBigPassage(req, res, true, false, true);
    if(!bigRes){
        return res.redirect('/');
    }
    if(!res.headersSent){
        bigRes.subPassages = await passageService.fillUsedInList(bigRes.subPassages);
        var location = await passageService.getPassageLocation(bigRes.passage);
        await passageService.getRecursiveSpecials(bigRes.passage);
        
        // Check if user can create products
        let canCreateProducts = false;
        if (req.session.user) {
            canCreateProducts = await scripts.canCreateProducts(req.session.user);
        }
        
        res.render("stream", {
            subPassages: bigRes.subPassages, 
            passageTitle: bigRes.passage.title, 
            passageUsers: bigRes.passageUsers, 
            Passage: Passage, 
            scripts: scripts, 
            sub: false, 
            passage: bigRes.passage, 
            passages: false, 
            totalPages: bigRes.totalPages, 
            docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: false,
            page: 'more',
            whichPage: 'comments',
            location: location,
            comments: true,
            canCreateProducts: canCreateProducts
        });
    }
};

// Subforums view
const subforums = async (req, res) => {
    const systemService = require('../services/systemService');
    if(req.session.CESCONNECT){
        return systemService.getRemotePage(req, res);
    }
    var bigRes = await passageService.getBigPassage(req, res, true, true);
    if(!bigRes){
        return res.redirect('/');
    }
    if(!res.headersSent){
        bigRes.subPassages = await passageService.fillUsedInList(bigRes.subPassages);
        var location = await passageService.getPassageLocation(bigRes.passage);
        await passageService.getRecursiveSpecials(bigRes.passage);
        
        // Check if user can create products
        let canCreateProducts = false;
        if (req.session.user) {
            canCreateProducts = await scripts.canCreateProducts(req.session.user);
        }
        
        res.render("stream", {
            subPassages: bigRes.subPassages, 
            passageTitle: bigRes.passage.title, 
            passageUsers: bigRes.passageUsers, 
            Passage: Passage, 
            scripts: scripts, 
            sub: false, 
            passage: bigRes.passage, 
            passages: false, 
            totalPages: bigRes.totalPages, 
            docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: false,
            page: 'more',
            whichPage: 'subforums',
            location: location,
            subforums: true,
            canCreateProducts: canCreateProducts
        });
    }
};

// Get big passage
const getBigPassage = async (req, res) => {
    console.log(req.query._id);
    var bigRes = await passageService.getBigPassage(req, res);
    if(!bigRes){
        return res.redirect('/');
    }
    if(!res.headersSent){
        bigRes.subPassages = await passageService.fillUsedInList(bigRes.subPassages);
        var location = await passageService.getPassageLocation(bigRes.passage);
        await passageService.getRecursiveSpecials(bigRes.passage);
        res.render("passage", {
            subPassages: bigRes.subPassages, 
            passageTitle: bigRes.passage.title, 
            passageUsers: bigRes.passageUsers, 
            Passage: Passage, 
            scripts: scripts, 
            sub: false, 
            passage: bigRes.passage, 
            passages: false, 
            totalPages: bigRes.totalPages, 
            docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: false,
            sub: true,
            page: 'more',
            whichPage: 'sub',
            location: location,
            subPassage: true
        });
    }
};

async function increaseReward(req, res){
    if(isNaN(Number(req.body.value)) || req.body.value == '' || Number(req.body.value) <= 0){
        return res.send("Invalid input.");
    }
    var value = Number(req.body.value);
    var user = await User.findOne({_id: req.session.user._id.toString()});
    if((user.stars + user.borrowedStars + user.donationStars) < value){
        return res.send("Not enough stars.");
    }
    var remainder = value;
    var borrowedUsed = 0;
    var starsTakenAway = 0;
    var donationUsed = 0;
    // First, spend borrowed stars
    if(user.borrowedStars > 0){
        borrowedUsed = Math.min(user.borrowedStars, remainder);
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
                donationUsed = Math.min(user.donationStars, remainder);
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
                donationUsed = Math.min(user.donationStars, remainder);
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
    var parentPassage = await Passage.findOne({_id:req.body._id});
    if(!parentPassage.team){
        await User.updateOne({
            _id: req.session.user._id.toString()
        }, {
            $inc: {
                stars: -starsTakenAway,
                borrowedStars: -borrowedUsed,
                donationStars: -donationUsed
            }
        });
    }else{
        await Team.updateOne({
            id: parentPassage.team._id,
            'ledger.user': req.session.user._id.toString()
        }, {
            $inc: { 'ledger.$.stars': -value }
        });
    }
    //add reward to winning users
    var reward = await Reward.findOne({parentPassage: req.body._id}).populate('passage');
    if(reward){
        var passage = await Passage.findOne({_id:reward.passage._id.toString()}).populate('sourceList');
        var sourceList = await passageService.getRecursiveSourceList(passage.sourceList, [], passage);
        var allContributors = passageService.getAllContributors(passage, sourceList);
        // Build bulk operations for all contributors except a contributor if passage is merely selected answer and contributor is author of rewarding passage
        if(!passage.team){
            const bulkOps = allContributors
                .filter(contributor => passage.selectedAnswer && !passage.inFirstPlace && (contributor !== parentPassage.author._id))
                .map(contributor => ({
                    updateOne: {
                        filter: { _id: contributor },
                        update: { $inc: { starsGiven: value } }
                    }
                }));
            
            // Execute bulk write if there are operations
            if(bulkOps.length > 0){
                await User.bulkWrite(bulkOps);
            }
        }else{
            const bulkOps = allContributors
                .filter(contributor => passage.selectedAnswer && !passage.inFirstPlace && (contributor !== parentPassage.author._id))
                .map(contributor => ({
                    updateOne: {
                        filter: { _id: passage.team._id, 'ledger.user': contributor },
                        update: { $inc: { 'ledger.$.points': value } }
                    }
                }));
            
            // Execute bulk write if there are operations
            if(bulkOps.length > 0){
                await Team.bulkWrite(bulkOps);
            }
        }
    }
    //update reward amount and stars
    await Passage.updateOne({
        _id: req.body._id
    }, {
        $inc: {
            reward: Number(req.body.value),
            stars: value
        }
    });
    return res.send("Reward Increased.");
}
async function selectAnswer(req, res){
    //answer to select
    var passage = await Passage.findOne({_id: req.body.answer.toString()}).populate('parent');
    var currentlySelected = await Passage.findOne({
        parent: passage.parent._id.toString(),
        selectedAnswer: true
    });
    if(currentlySelected && req.body.answer.toString() === currentlySelected._id.toString()){
        return res.send("That is already the selected answer.");
    }
    var sourceList = await passageService.getRecursiveSourceList(passage.sourceList, [], passage);
    var allContributors = passageService.getAllContributors(passage, sourceList);
    //unselect current answer
    if(currentlySelected){
        await Passage.updateOne({_id: currentlySelected._id.toString()}, {
            $set: {
                selectedAnswer: false
            }
        });
    }
    //take reward away from current answer
    const oldReward = await Reward.findOne({parentPassage: passage.parent._id.toString(), selectedAnswer: true});
    if(oldReward && passage.parent && passage.parent.reward > 0){
        //remove reward from all contributors
        //where contributor !== req.session.user (because they wouldnt have gotten the reward in the first place)
        for(const contributor of allContributors){
            if(contributor !== req.session.user._id.toString()){
                if(!passage.team){
                    await User.updateOne({_id: contributor}, {
                        $inc: { starsGiven: -passage.parent.reward }
                    });
                }else{
                    await Team.updateOne({
                    id: passage.team._id,
                    'ledger.user': contributor
                    }, {
                        $inc: { 'ledger.$.points': -passage.parent.reward }
                    });
                }
            }
        }
    }
    //delete old reward
    await Reward.deleteOne({parentPassage: passage.parent._id.toString(), selectedAnswer: true});
    //add new answer
    await Passage.updateOne({_id: req.body.answer.toString()}, {
        $set: {
            selectedAnswer: true
        }
    });
    //give reward if not author of passage being selected
    await Reward.create({
        user: req.session.user._id.toString(),
        passage: passage._id.toString(),
        parentPassage: passage.parent._id.toString(),
        selectedAnswer: true
    });
    //add points to all contributors who got reward
    //who arent equal to req.session.user
    if(passage.parent && passage.parent.reward > 0){
        for(const contributor of allContributors){
            if(contributor !== req.session.user._id.toString()){
                if(!passage.team){
                    await User.updateOne({_id: contributor}, {
                        $inc: { starsGiven: passage.parent.reward }
                    });
                }else{
                    await Team.updateOne({
                    id: passage.team._id,
                    'ledger.user': contributor
                    }, {
                        $inc: { 'ledger.$.points': passage.parent.reward }
                    });
                }
            }
        }
    }
    return res.send("Answer selected.");
}
async function _protected(req, res){
    if(!req.session.user){
            return res.redirect('/');
        }
        var passages = await Passage.find({
            filename: {
                $in: [req.params.filename]
            }
        }).populate('team');
        var clear = false;
        for(const p of passages){
            if(p.author._id.toString() == req.session.user._id.toString()
                || p.users.includes(req.session.user._id) 
                || p.collaborators.includes(req.session.user._id)
                || scripts.inTeam(req.session.user, p.team) 
                || scripts.isTeamLeader(req.session.user, p.team)
                || passage.teamOpen){
                clear = true;
                break;
            }
        }
        if(clear){
            switch(req.params.filename.split('.').at(-1)){
                case 'png':
                    res.type('image/png');
                    break;
                case 'webm':
                    res.type('video/webm');
                    break;
            }
            return res.sendFile('protected/'+req.params.filename, {root: __dirname});
        }
        else{
            return res.redirect('/');
        }
}
module.exports = {
    passage,
    deletePassage,
    getPassageJSON,
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
    cat,
    removeSource,
    changeLabel,
    _eval,
    addUser,
    removeUser,
    showBestOf,
    sameUsers,
    sameCollabers,
    sameSources,
    updateMirroring,
    sticky,
    comments,
    subforums,
    getBigPassage,
    increaseReward,
    selectAnswer,
    _protected
};