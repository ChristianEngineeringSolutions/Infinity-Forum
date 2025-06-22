'use strict';

const Bookmark = require('../models/Bookmark');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');

async function getBookmarks(user){
    return await Bookmark.find({user:user._id}).populate('passage');
}

// Helper function to bookmark a passage (from sasame.js line 3368)
async function createBookmark(_id, _for){
    let user = await User.findOne({_id: _for});
    // user.bookmarks.push(_id);
    // await user.save();
    var passage = await Passage.findOne({_id: _id});
    let bookmark = await Bookmark.create({
        user: user,
        passage: passage
    });
    return "Done.";
}

module.exports = {
	getBookmarks,
	createBookmark
};