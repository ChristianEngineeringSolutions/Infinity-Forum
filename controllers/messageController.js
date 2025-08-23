'use strict';

const Bookmark = require('../models/Bookmark');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const Message = require('../models/Message');
const { scripts, DOCS_PER_PAGE } = require('../common-utils');
const passageService = require('../services/passageService');
const messageService = require('../services/messageService');
const bookmarkService = require('../services/bookmarkService');

async function messages(req, res){
    //paginate messages
    //...TODO

    //serve messages
    //sort them by stars
    var messages = await Message.find({
        to: req.session.user._id,
        passage: {
            $ne: null
        }
    }).populate('passage').sort({stars:-1, _id:-1}).limit(DOCS_PER_PAGE);
    messages = messages.filter(function(x){
        return x.passage != null;
    });
    var passages = [];
    for(const message of messages){
        var p = await Passage.findOne({
            _id: message.passage._id
        }).populate('author users sourcelist collaborators versions');
        passages.push(p);
    }
    for(var i = 0; i < passages.length; ++i){
        passages[i] = await passageService.getPassage(passages[i]);
    }

    let bookmarks = [];
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
        // }
        if(req.session.user){
            bookmarks = bookmarkService.getBookmarks(req.session.user);
        }
    passages = await passageService.fillUsedInList(passages);
    
    // Check if user can create products
    let canCreateProducts = false;
    if (req.session.user) {
        canCreateProducts = await scripts.canCreateProducts(req.session.user);
    }
    
    res.render('messages', {
        passages: passages,
        subPassages: false,
        passageTitle: false, 
        scripts: scripts, 
        passage: {id:'root', author: {
            _id: 'root',
            username: 'Sasame'
        }},
        page: 1,
        bookmarks: bookmarks,
        canCreateProducts: canCreateProducts
    });
}

module.exports = {
    messages
};