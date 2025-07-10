'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const System = require('../models/System');
const Follower = require('../models/Follower');
const Notification = require('../models/Notification');
const userService = require('../services/userService');
const systemService = require('../services/systemService');
const bookmarkService = require('../services/bookmarkService');
const {DOCS_PER_PAGE, scripts} = require('../common-utils');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const fsp = require('fs').promises;
const { v4 } = require('uuid');
const browser = require('browser-detect');

// Helper function to upload profile photo
async function uploadProfilePhoto(req, res){
    var user = await User.findOne({_id: req.session.user._id});
    if(req.files == null){
        await fsp.unlink('./dist/uploads/'+user.thumbnail);
        // Use atomic update to clear thumbnail
        await User.updateOne(
            { _id: req.session.user._id },
            { $set: { thumbnail: '' } }
        );
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
                        
                        // Use atomic update to set new thumbnail
                        await User.updateOne(
                            { _id: req.session.user._id },
                            { $set: { thumbnail: uploadTitle } }
                        );
                        
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
            
            // Prepare update data
            const updateData = {
                name: req.body.name,
                about: req.body.about,
                username: req.body.newUsername,
                safeMode: req.body['safe-mode'] && req.body['safe-mode'] == 'on' ? true : false
            };
            
            var sameEmail = await User.findOne({email: req.body.email});
            if(sameEmail._id.toString() != user._id.toString()){
                return res.send("An Account with that email already exists.");
            }
            updateData.email = req.body.email;
            
            if(req.body.password.length > 0){
                updateData.password = await bcrypt.hash(req.body.password, 10);
            }
            
            // Use atomic update
            await User.updateOne(
                { _id: user._id },
                { $set: updateData }
            );
            
            // Refresh user in session
            req.session.user = await User.findOne({_id: user._id});
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
    const { getPassage, fillUsedInList } = require('../services/passageService');
    const { getBookmarks } = require('../services/bookmarkService');
    const { scripts } = require('../common-utils');

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
        var bookmarks = bookmarkService.getBookmarks(req.session.user);
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

module.exports = {
    follow,
    changeProfilePicture,
    deleteProfileController,
    updateSettings,
    getUsernameNumber,
    getProfile,
    getNotifications,
    leaderboard,
};