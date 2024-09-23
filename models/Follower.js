'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const followerSchema = mongoose.Schema({
    //who is doing the following
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //who they are following
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
});

followerSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Follower', followerSchema, 'Followers');