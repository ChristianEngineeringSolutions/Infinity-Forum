'use strict';

const { Passage, PassageSchema } = require('../models/Passage');
const bookmarkService = require('../services/bookmarkService');
const { User } = require('../models/User');
const { Message } = require('../models/Message');
const { Follower } = require('../models/Follower');
const { deleteOldUploads } = require('./fileController');
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

async function forumPage(req, res) {
    const { getUserBookmarks } = require('../controllers/bookmarkController');
    // await clearForum();
    // await fillForum(req);
    let bookmarks = [];
    if(req.session.user){
        bookmarks = bookmarkService.getUserBookmarks(req.session.user);
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
    const { getUserBookmarks } = require('../controllers/bookmarkController');
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
            bookmarks = bookmarkServicegetUserBookmarks(req.session.user);
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
      const result = await passageController.generateFeedWithPagination(req.session.user, page, limit);
      
      // If we need to redirect to a different page (e.g., if requested page is beyond results)
      if (result.redirect) {
        return res.redirect(`/feed?page=${result.page}`);
      }
      
      // Process passages with getPassage to get all required data
      const passages = [];
      for (let i = 0; i < result.feed.length; i++) {
        const processedPassage = await passageController.getPassage(result.feed[i]);
        passages.push(processedPassage);
      }
      
      // Get bookmarks for sidebar
      let bookmarks = [];
      if (req.session.user) {
        bookmarks = await getUserBookmarks(req.session.user);
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

module.exports = {
    deletePassage,
    postsPage,
    forumPage,
    personalPage,
    feedPage
};