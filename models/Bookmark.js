'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const bookmarkSchema = mongoose.Schema({
    //who is the bookmark for?
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    created: {type: Date, default: Date.now},
});

bookmarkSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Bookmark', bookmarkSchema, 'Bookmarks');