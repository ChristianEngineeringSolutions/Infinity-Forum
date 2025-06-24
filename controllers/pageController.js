'use strict';

const browser = require('browser-detect');
const bookmarkService = require('../services/bookmarkService');
const passageService = require('../services/passageService');
const systemService = require('../services/systemService');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts, totalUSD, totalStarsGiven, DOCS_PER_PAGE } = require('../common-utils');
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
        return res.render("stream", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title == '' ? 'Untitled' : bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: bigRes.ISMOBILE,
            thread: false,
            page: 'more',
            whichPage: 'sub',
            location: location
        });
    }
}
async function terms(req, res) {
    res.render('terms');
}
async function donate(req, res) {
    if(req.session.CESCONNECT){
            return systemService.getRemotePage(req, res);
        }
    var usd = await totalUSD();
    var stars = await totalStarsGiven();
    if(req.session.user){
        var subscriptionQuantity = req.session.user.subscriptionQuantity;
    }else{
        var subscriptionQuantity = 0;
    }
    res.render('donate', {
        passage: {id: 'root'}, usd: Math.floor((await scripts.getMaxToGiveOut())/100), stars: stars,
        totalUSD: Math.floor(usd/100),
        donateLink: process.env.STRIPE_DONATE_LINK,
        subscribeLink: process.env.STRIPE_SUBSCRIBE_LINK,
        subscriptionQuantity: subscriptionQuantity,
    });
}
async function leaderboard(req, res) {
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    if(req.session.CESCONNECT){
        return systemService.getRemotePage(req, res);
    }
    var page = req.query.page || 1;
    var limit = DOCS_PER_PAGE * 2;
    // limit = 2;
    // let users = await User.find().sort('-starsGiven');
    let users = await User.paginate({}, {sort: '-starsGiven _id', page: page, limit: limit});
    users = users.docs;
    var i = 1;
    for(const user of users){
        user.rank = i + ((page-1)*limit);
        ++i;
    }
    if(page == 1){
        return res.render('leaderboard', {passage: {id: 'root'},users: users, scripts: scripts,
    ISMOBILE: ISMOBILE, page: page, rank: true});
    }
    else{
        return res.render('leaders', {users: users, page: page, rank: false});
    }
}
// Add other moderator-specific controller functions here

module.exports = {
    index,
    terms,
    leaderboard,
    donate,
    passage
};