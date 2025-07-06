'use strict';

const Bookmark = require('../models/Bookmark');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts } = require('../common-utils');
const passageService = require('../services/passageService');
const bookmarkService = require('../services/bookmarkService');

// Transfer bookmark route handler (from sasame.js line 3401)
async function transferBookmark(req, res) {
    if(!req.session.user){
            return res.send("<h2 style='text-align:center;color:red;'>You must be logged in.</h2>");
        }
    let _id = req.body._id;
    let parent = req.body.parent;
    //first check if parent allow submissions (is Public)
    if(parent !== 'root' && req.body.focus == 'false'){
        let parentPassage = await Passage.findOne({_id: parent});
        if(parentPassage.public === false && parentPassage.author.toString() != req.session.user._id.toString() && !scripts.isPassageUser(req.session.user, parentPassage)){
            return res.send("<h2 style='text-align:center;color:red;'>Passage is private. Ask to be on the Userlist, or consider Bookmarking it, and copying it over to your own passage (press \"cite\").</h2>");
        }
    }
    //get passage to copy
    let user;
    let passage = await Passage.findOne({_id: req.body._id});
    //reset author list
    if (typeof req.session.user === 'undefined' || req.session.user === null) {
        user = null;
    }
    else{
        user = [req.session.user];
    }
    parent = req.body.parent == 'root' ? null : req.body.parent;
    if(req.body.focus == 'false'){
        if(req.body.which == 'comments'){
            var comment = true;
        }
        else{
            var comment = false;
        }
        console.log(comment);
        let copy = await passageService.copyPassage(passage, user, parent, function(){
            
        }, false, comment);
        copy = await passageService.getPassage(copy);
        if(req.body.which && req.body.which == 'cat'){
            return res.render('cat_row', {subPassages: false, topic: copy, sub: true});
        }
        else{
            return res.render('passage', {subPassage: true, subPassages: false, passage: copy, sub: true});
        }
    }else{
        var title = passage.title == '' ? 'Untitled' : passage.title;
        //add passage to sourcelist
        parent = await Passage.findOne({_id: req.body.parent});
        if((!req.session.user && !req.session.user.admin) || ((req.session.user._id.toString() !== parent.author._id.toString()) && !req.session.user.admin)){
            return res.send("<h2 style='text-align:center;color:red;'>You can only add sources to your own passages.</h2>");
        }
        if(parent._id.toString() == passage._id.toString()){
            return res.send('<div data-token="'+passage._id+'"data-title="'+title+'"class="new-source">"'+title+'" Could not be added. A passage can not directly cite itself.</div>');
        }
        parent.sourceList.push(passage._id);
        //remove duplicates
        parent.sourceList = Object.values(parent.sourceList.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
        parent.markModified('sourceList');
        await parent.save();
        //passage usage list has grown so put it higher in feed
        passage.lastUpdated = Date.now();
        await passage.save();
        console.log('sources:'+parent.sourceList);
        var test = await Passage.findOne({_id:parent._id});
        console.log('sources'+test.sourceList);
        return res.send('<div data-token="'+passage._id+'"data-title="'+title+'"class="new-source">"'+title+'" Added to Sourcelist.</div>');
    }
}

// Remove bookmark route handler (from sasame.js line 3764)
async function removeBookmark(req, res) {
    let _id = req.body._id;
    await Bookmark.deleteOne({_id:_id});
    // await user.save();
    res.send("Done.");
}

// Create passage from JSON and bookmark it (from sasame.js line 1863)
async function passageFromJson(req, res) {
    //copy passage
    var copy = passageService.copyPassage(req.params.passage, [req.session.user], null, function(){
        
    });
    await bookmarkService.createBookmark(copy._id, req.session.user._id);
}

// Get user's bookmarks route handler (from sasame.js line 657)
async function getBookmarks(req, res) {
    // let bookmarks = [];
    // if(req.session.user){
    //     let user = await User.findOne({_id: req.session.user._id}).populate('bookmarks');
    //     bookmarks = user.bookmarks;
    // }
    // for(const bookmark of bookmarks){
    //     bookmarks[bookmark] = bubbleUpAll(bookmark);
    // }
    var bookmarks = await Bookmark.find({user: req.session.user}).sort('-_id').populate('passage');
    // for(const bookmark of bookmarks){
    //     bookmarks[bookmark].passage = bubbleUpAll(bookmark.passage);
    // }
    for(const bookmark of bookmarks){
        try{
        if(bookmark.passage != null){
            if(bookmark.passage.mirror != null){
                if(bookmark.passage.mirrorEntire){
                    var mirror = await Passage.findOne({_id:bookmark.passage.mirror._id});
                    if(mirror != null){
                        bookmark.passage.title = mirror.title;
                    }else{
                        bookmark.mirror.title = 'Error (Working on it)';
                    }
                }
            }
            if(bookmark.passage.bestOf != null){
                if(bookmark.passage.bestOfEntire){
                    var mirror = await Passage.findOne({parent:bookmark.passage.bestOf._id}).sort('-stars');
                    if(mirror != null){
                        bookmark.passage.title = mirror.title;
                    }else{
                        bookmark.mirror.title = 'Error (Working on it)';
                    }
                }
            }
        }
        }catch(e){
            console.log(e);
        }
    }
    res.render('bookmarks', {bookmarks: bookmarks});
}

// Bookmark a passage route handler (from sasame.js line 3379)
async function bookmarkPassage(req, res) {
    if(req.body.content == ''){
        await bookmarkService.createBookmark(req.body._id, req.session.user._id);
    }
    else{
        let passage = await Passage.findOne({_id: req.body._id});
        let copy = await passageService.copyPassage(passage, [req.session.user], null, function(){});
        copy[req.body.which] = req.body.content;
        await copy.save();
        await bookmarkService.createBookmark(copy._id, req.session.user._id);
    }
    res.send('Done.');
}

module.exports = {
    getBookmarks,
    bookmarkPassage,
    getBookmarks,
    bookmarkPassage,
    transferBookmark,
    removeBookmark,
    passageFromJson
};