'use strict';
const mongoose = require('mongoose');
const { v4 } = require('uuid');

const starSchema = mongoose.Schema({
    //who cast the star
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //author of the passage that was starred
    //owes the debt
    passageAuthor: {
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
    //was this a non-single star triggered by a single star event?
    fromSingle:{
        type: Boolean,
        default: false
    },
    //recursive sources at the time of being starred
    sources: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    trackToken: {
        type: String,
        default: () => v4(),
        unique: true
    },
    date:{
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Star', starSchema, 'Stars');