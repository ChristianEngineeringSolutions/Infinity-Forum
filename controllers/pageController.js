'use strict';

const browser = require('browser-detect');
const bookmarkService = require('../services/bookmarkService');
const passageService = require('../services/passageService');
const systemService = require('../services/systemService');
const { Passage } = require('../models/Passage');
const { scripts } = require('../common-utils');
async function index(req, res) {
    if(req.session.CESCONNECT){
        systemService.getRemotePage(req, res);
    }
    else{
        const isMobile = browser(req.headers['user-agent']).mobile;
        let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
        let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
        let golden = '';
        let addPassageAllowed = true;
        let addChapterAllowed = true;
        var user = req.session.user || null;
        let passageUsers = [];
        let bookmarks = [];
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
        // }
        if(req.session.user){
            bookmarks = bookmarkService.getBookmarks(req.session.user);
        }
        res.render("index", {
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passages: [], 
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            bookmarks: bookmarks,
        });
    }
}

// Add other moderator-specific controller functions here

module.exports = {
    index
};