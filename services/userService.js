'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const passageService = require('../services/passageService');

// Helper function to check if user exists
async function userExists(email) {
    const user = await User.findOne({ email: email });
    return user !== null;
}
async function authenticateUsername(username, password){
    const bcrypt = require('bcrypt');
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let obj = {};
    let search = '';
    if(username.match(regex) === null){
        //it's a username
        search = "username";
    }
    else{
        //it's an email
        search = "email";
    }
    obj[search] = username;
    var user = await User.findOne(obj);
    if(!user){
        return false;
    }
    var result = await bcrypt.compare(password, user.password);
    if(result === true){
        return user;
    }
    return false;
}

// Helper function to delete profile
async function deleteProfile(userID){
    //delete profile and all associated passages
    var user = await User.findOne({_id:userID});
    var passages = await Passage.find({author:user._id.toString()});
    for(const passage of passages){
        await passageService.deletePassage(passage); // This function should be in passageService
    }
    await User.deleteOne({_id:user._id});
}
module.exports = {
    userExists,
    authenticateUsername,
    deleteProfile
};