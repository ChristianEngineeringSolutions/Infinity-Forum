'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');

// Helper function to check if user exists
async function userExists(email) {
    const user = await User.findOne({ email: email });
    return user !== null;
}
async function authenticateUsername(username, password) {
    const bcrypt = require('bcrypt');
    const user = await User.findOne({ username: username });
    if (user && await bcrypt.compare(password, user.password)) {
        return user;
    }
    return null;
}

// Helper function to delete profile
async function deleteProfile(userID){
    //delete profile and all associated passages
    var user = await User.findOne({_id:userID});
    var passages = await Passage.find({author:user._id.toString()});
    for(const passage of passages){
        await deletePassage(passage); // This function should be in passageService
    }
    await User.deleteOne({_id:user._id});
}
module.exports = {
    userExists,
    authenticateUsername,
    deleteProfile
};