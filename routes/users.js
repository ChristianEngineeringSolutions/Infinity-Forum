'use strict';

const express = require('express');
const router = express.Router();
// Will need user controller
// const userController = require('../controllers/userController');

// Follow route
router.post('/follow', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Follow placeholder' });
});

// User management routes
router.post('/add_user', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Add user placeholder' });
});

router.post('/remove_user', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Remove user placeholder' });
});

// Profile management
router.post('/change_profile_picture/', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Change profile picture placeholder' });
});

router.post('/delete-profile', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Delete profile placeholder' });
});

// Settings routes
router.post('/update_settings/', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Update settings placeholder' });
});

// Username utility - implemented from sasame.js line 1592
router.post('/get_username_number', async (req, res) => {
  const { User } = require('../models/User');
  let name = req.body.name;
  let number = await User.countDocuments({name:name.trim()}) + 1;
  res.send(number + '');
});

// Profile route - from sasame.js line 1457
router.get("/profile/:username?/:_id?/", async (req, res) => {
  const { User } = require('../models/User');
  const { Passage } = require('../models/Passage');
  const { System } = require('../models/System');
  const { Follower } = require('../models/Follower');
  const { Notification } = require('../models/Notification');
  const { getPassage, fillUsedInList } = require('../controllers/passageController');
  const { getBookmarks } = require('../controllers/bookmarkController');
  const { scripts } = require('../common-utils');
  const DOCS_PER_PAGE = 10;

  let bookmarks = [];
  let profile;
  if(typeof req.params.username == 'undefined' || !req.params._id){
      if(!req.session.user){
          return res.redirect('/');
      }
      profile = req.session.user;
  }
  else{
      profile = await User.findOne({_id: req.params._id});
      console.log("TEST:"+profile.rank);
  }
  if(profile == null){
      return res.redirect('/');
  }
  let find = {
      //author: profile, 
      users: {
          $in: [profile]
      },
      deleted: false, 
      personal: false,
      versionOf: null
  };
  //if it's their profile show personal passages
  // if(req.session.user && profile._id.toString() == req.session.user._id.toString()){
  //     find.$or = [{personal: true}, {personal: false}];
  // }
  let passages = await Passage.find(find).populate('author users sourceList collaborators versions').sort({stars: -1, _id: -1}).limit(DOCS_PER_PAGE);
  for(var i = 0; i < passages.length; ++i){
      passages[i] = await getPassage(passages[i]);
  }
  // if(req.session.user){
  //     bookmarks = await User.find({_id: req.session.user._id}).populate('passages').passages;
  // }
  if(req.session.user){
      bookmarks = getBookmarks(req.session.user);
  }
  var usd = 0;
  const SYSTEM = await System.findOne({});
  // usd = parseInt((await percentStarsGiven(profile.starsGiven)) * (await scripts.getMaxToGiveOut()));
  let systemStarsGiven = SYSTEM.totalStarsGiven;
  console.log(profile.starsGiven);
  console.log("SYSTEMSTARS:"+systemStarsGiven);
  console.log("SYSTEMMAX:"+(await scripts.getMaxToGiveOut()));
  usd = (profile.starsGiven/systemStarsGiven) * (await scripts.getMaxToGiveOut());
  console.log(parseInt(parseInt(profile.starsGiven)/parseInt(systemStarsGiven)));
  console.log(profile.starsGiven/systemStarsGiven);
  if(isNaN(usd)){
      usd = 0;
  }
  passages = await fillUsedInList(passages);
  var following;
  if(req.session.user){
      var follower = await Follower.findOne({
          user: req.session.user._id,
          following: profile._id
      });
  }
  else{
      var follower = null;
  }
  if(follower == null){
      var followings = await Follower.find({});
      console.log(followings);
      console.log("Not Following");
      following = false;
  }
  else{
      following = true;
  }
  usd = usd == 0 ? 0 : usd/100;
  if(isNaN(usd)){
      usd = 0;
  }
  res.render("profile", {usd: parseInt(usd), subPassages: false, passages: passages, scripts: scripts, profile: profile,
  bookmarks: bookmarks,
  whichPage: 'profile',
  page: 1,
  thread: false,
  following: following,
  passage: {id:'root', author: {
              _id: 'root',
              username: 'Sasame'
          }}
  });
});

// Follow route - from sasame.js line 1545
router.post('/follow', async (req, res) => {
  const { Follower } = require('../models/Follower');
  var isFollowing = await Follower.findOne({
      user: req.session.user,
      following: req.body.who
  });
  if(isFollowing == null){
      var following = await Follower.create({
          user: req.session.user,
          following: req.body.who
      });
      return res.send("Followed.");
  }
  else{
      await Follower.deleteOne({
      user: req.session.user,
      following: req.body.who
  });
  }
  return res.send("Unfollowed");
});

// Notifications route - from sasame.js line 1565
router.get('/notifications', async (req, res) => {
  const { Notification } = require('../models/Notification');
  const { getBookmarks } = require('../controllers/bookmarkController');
  const { scripts } = require('../common-utils');
  const browser = require('browser-detect');
  
  const ISMOBILE = browser(req.headers['user-agent']).mobile;
  if(!req.session.user){
      return res.redirect('/');
  }
  var notifications = await Notification.find({
      for: req.session.user
  }).sort({_id: -1}).limit(20);
  if(req.session.user){
      var bookmarks = getBookmarks(req.session.user);
  }
  return res.render('notifications', {
          subPassages: false,
          passageTitle: false, 
          scripts: scripts, 
          passages: [], 
          passage: {id:'root', author: {
              _id: 'root',
              username: 'Sasame'
          }},
          bookmarks: bookmarks,
          ISMOBILE: ISMOBILE,
          page: 'more',
          whichPage: 'notifications',
          notifications: notifications
      });
});

// Daemon management for users
router.get('/get_daemons', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Get daemons placeholder' });
});

router.post('/add_daemon', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Add daemon placeholder' });
});

router.post('/remove_daemon', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Remove daemon placeholder' });
});

router.post('/sort_daemons', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Sort daemons placeholder' });
});

module.exports = router;