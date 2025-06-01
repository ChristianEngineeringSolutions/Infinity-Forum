'use strict';
const mongoose = require('mongoose');
const { v4 } = require('uuid');

const sourceSchema = mongoose.Schema({
    //who made the source
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //passage the source is being added to
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    //the actual source
    source: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    disputed:{
        type: Boolean,
        default: false
    },
    addedByReview:{
        type: Boolean,
        default: false
    },
    reasonForDispute:{
        type: String,
        default: ''
    },
    date:{
        type: Date,
        default: Date.now
    },
    //list of moderators who voted
    moderators: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    votes: [Number],
    reasons: [String],
    //is this just a suggestion? 
    suggested: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: false
    },
    //has been voted on
    hardActive: {
        type: Boolean,
        default: false
    },
    //now only a collaborator can add this as a source
    hardInactive: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Source', sourceSchema, 'Sources');