'use strict';

const browser = require('browser-detect');
const bookmarkService = require('../services/bookmarkService');
const passageService = require('../services/passageService');
const systemService = require('../services/systemService');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const {monthsBetween} = require('../common-utils');
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
async function terms(req, res) {
    res.render('terms', {DAEMONS: []});
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
        passage: {id: 'root'}, 
        usd: Math.floor((await scripts.getMaxToGiveOut())/100), 
        stars: stars,
        totalUSD: Math.floor(usd/100),
        donateLink: process.env.STRIPE_DONATE_LINK,
        subscribeLink: process.env.STRIPE_SUBSCRIBE_LINK,
        subscriptionQuantity: subscriptionQuantity,
    });
}
async function bank(req, res){
    if (!req.session.user) {
    return res.redirect('/loginform');
  }
  var usd = await totalUSD();
  var user = await User.findOne({_id:req.session.user._id});
  var today = new Date();
    //its been more than a month since they last got stars so reset the month we're looking at
    if(user.monthStarsBorrowed && monthsBetween(user.monthStarsBorrowed, today) > 0){
        user.monthStarsBorrowed = Date.now();
        user.starsBorrowedThisMonth = 0;
        await user.save();
    }
  return res.render('bank', {
        borrowedAmount:user.borrowedStars, 
        starsBorrowedThisMonth: user.starsBorrowedThisMonth,
        usd: Math.floor((await scripts.getMaxToGiveOut())/100), 
        totalUSD: Math.floor(usd/100),
    });
}
async function fileStream(req, res){
     const ISMOBILE = browser(req.headers['user-agent']).mobile;
    //output passages in directory / or req.body.directory
    var directory = req.params.directory || __dirname;
    //get passages where fileStreamPath starts with directory
    var viewMainFile;
    if(req.params.viewMainFile === 'false'){
        viewMainFile = false;
    }
    else if(req.params.viewMainFile === 'true'){
        viewMainFile = true;
    }
    else{
        viewMainFile = true;
    }
    var passages;
    if(viewMainFile){
        passages = await Passage.find({
            fileStreamPath: {
                $regex: '^' + directory + '/[^/]*(/?)$',
                $options: 'i'
            },
            mainFile: viewMainFile
        }).collation({locale: 'en', strength: 2}).sort({title: 1}); //sort alphabetically
    }
    else{
        //there may be duplicates so sort by stars
        passages = await Passage.find({
            fileStreamPath: {
                $regex: '^' + directory + '/[^/]*(/[^/]*)?$',
                $options: 'i'
            },
            // mainFile: viewMainFile
        }).sort({stars: '-1'}).limit(10);
    }
    let bookmarks = [];
    // if(req.session.user){
    //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
    // }
    if(req.session.user){
        bookmarks = bookmarkService.getBookmarks(req.session.user);
    }
    for(var i = 0; i < passages.length; ++i){
        passages[i] = await passageService.getPassage(passages[i]);
    }
    res.render("filestream", {
        subPassages: false,
        passageTitle: false, 
        scripts: scripts, 
        passages: passages, 
        mainFiles: viewMainFile,
        passage: {id:'root', author: {
            _id: 'root',
            username: 'Sasame'
        }},
        bookmarks: bookmarks,
        ISMOBILE: ISMOBILE
    });
    // return res.render('passages', {
    //     passages: passages,
    //     subPassages: false
    // });
    //on directory click just run same route with different directory
}
async function createCommission(req, res){
    return res.render('create-commission');
}
async function takeCommission(req, res){
    return res.render('take-commission');
    
}
module.exports = {
    index,
    terms,
    donate,
    bank,
    fileStream,
    createCommission,
    takeCommission
};