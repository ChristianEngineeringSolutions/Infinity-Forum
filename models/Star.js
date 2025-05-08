'use strict';
const mongoose = require('mongoose');

const starSchema = mongoose.Schema({
    //who cast the star
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //author of the passage that was starred
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //which passage was starred
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    system:{
        type: Boolean,
        default: true
    },
    amount:{
        type: Number,
        default: 0
    },
    debt:{
        type: Number,
        default: 0
    },
    single:{
        type: Boolean,
        default: true
    },
    //recursive sources at the time of being starred
    sources: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
});

module.exports = mongoose.model('Star', starSchema, 'Stars');