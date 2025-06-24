'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const System = require('../models/System');
const Follower = require('../models/Follower');
const Notification = require('../models/Notification');
const userService = require('../services/userService');
const systemService = require('../services/systemService');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const fsp = require('fs').promises;
const { v4 } = require('uuid');

// Helper function to upload profile photo
async function uploadProfilePhoto(req, res){
    var user = await User.findOne({_id: req.session.user._id});
    if(req.files == null){
        await fsp.unlink('./dist/uploads/'+user.thumbnail);
        user.thumbnail = '';
        await user.save();
    }else{
        // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
        var fileToUpload = req.files.photo;
        if(fileToUpload.size > 20 * 1024 * 1024){
            return "File too large.";
        }
        //uuid with  ext
        var uploadTitle = fileToUpload.name.split('.')[0] + v4() + "." + fileToUpload.name.split('.').at(-1);
        var where = 'uploads';
        console.log(uploadTitle);
        const partialpath = where === 'protected' ? where : 'dist/' + where;
        // Use the mv() method to place the file somewhere on your server
        fileToUpload.mv('./dist/'+where+'/'+uploadTitle, async function(err) {
            if (err){
                return res.status(500).send(err);
            }
            await new Promise((resolveCompress) => {
                exec('python3 compress.py "' + partialpath + '/' + uploadTitle + '" true',
                    async (err, stdout, stderr) => {
                        console.log(err + stdout + stderr);
                        console.log("Profile Image compressed.");
                        var oldThumbnail = user.thumbnail;
                        user.thumbnail = uploadTitle;
                        await user.save();
                        console.log("Old thumbnail:"+oldThumbnail);
                        console.log("Upload Title:"+uploadTitle);
                        try{
                            if(oldThumbnail != uploadTitle && oldThumbnail.length > 1)
                                await fsp.unlink('./dist/uploads/'+oldThumbnail);
                        }catch(err){
                            console.log(err);
                        }
                        console.log("Deleted old profile photo.");
                        resolveCompress();
                    }
                );
            });
        });
        user.thumbnail = uploadTitle;
        await user.save();
    }
}

// Follow/unfollow user
const follow = async (req, res) => {
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
};

// Add user to passage
const addUser = async (req, res) => {
    let passageId = req.body.passageId;
    let username = req.body.username;
    let user = await User.findOne({username: username});
    let passage = await Passage.findOne({_id: passageId});
    if(user && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        passage.users.push(user._id.toString());
        passage.markModified('users');
        await passage.save();
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
        var index = 0;
        for(const u of passage.users){
            if(u == userID){
                //remove user
                passage.users.splice(index, 1);
            }
            ++index;
        }
        passage.markModified('users');
        await passage.save();
        res.send("Done.");
    }
};

// Change profile picture
const changeProfilePicture = async (req, res) => {
    await uploadProfilePhoto(req, res);
    res.redirect("/profile");
};

// Delete profile (admin only)
const deleteProfileController = async (req, res) => {
    if(req.session.user && req.session.user.admin){
        await userService.deleteProfile(req.body._id);
        return res.send("Profile deleted.");
    }else{
        return res.send("Must be an admin");
    }
};

// Update user settings
const updateSettings = async (req, res) => {
    if ((req.body.email ||
      req.body.name) &&
      req.body.password == req.body.passwordConf &&
      req.body.oldPassword) {  
        var user = await userService.authenticateUsername(req.body.oldUsername, req.body.oldPassword);
        console.log(req.body.oldUsername + " : " + req.body.oldPassword);
        
        if(user && !user.simulated){
            req.session.user = user;
            user.name = req.body.name;
            user.about = req.body.about;
            user.username = req.body.newUsername;
            user.safeMode = req.body['safe-mode'] && req.body['safe-mode'] == 'on' ? true : false;
            var sameEmail = await User.findOne({email: req.body.email});
            if(sameEmail._id.toString() != user._id.toString()){
                return res.send("An Account with that email already exists.");
            }
            user.email = req.body.email;
            if(req.body.password.length > 0){
                user.password = await bcrypt.hash(req.body.password, 10);
            }
            await user.save();
            req.session.user = user;
            return res.redirect('/profile/');
        }
        else{
            return res.send("Incorrect password.");
        }
    }
    else{
        return res.send("Must have an email, name, and fill in your current password. No changes made.");
    }
};

// Get username number (for uniqueness)
const getUsernameNumber = async (req, res) => {
    let name = req.body.name;
    let number = await User.countDocuments({name:name.trim()}) + 1;
    res.send(number + '');
};

// Get user profile
const getProfile = async (req, res) => {
    const { getPassage, fillUsedInList } = require('./passageController');
    const { getBookmarks } = require('./bookmarkController');
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
        users: {
            $in: [profile]
        },
        deleted: false, 
        personal: false,
        versionOf: null
    };
    let passages = await Passage.find(find).populate('author users sourceList collaborators versions').sort({stars: -1, _id: -1}).limit(DOCS_PER_PAGE);
    for(var i = 0; i < passages.length; ++i){
        passages[i] = await getPassage(passages[i]);
    }
    if(req.session.user){
        bookmarks = getBookmarks(req.session.user);
    }
    var usd = 0;
    const SYSTEM = await System.findOne({});
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
};

// Get notifications
const getNotifications = async (req, res) => {
    const { getBookmarks } = require('./bookmarkController');
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
};

module.exports = {
    follow,
    addUser,
    removeUser,
    changeProfilePicture,
    deleteProfileController,
    updateSettings,
    getUsernameNumber,
    getProfile,
    getNotifications
};