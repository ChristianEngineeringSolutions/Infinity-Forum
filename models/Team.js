'use strict';
const mongoose = require('mongoose');

const teamSchema = mongoose.Schema({
    leader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    subscriptionAmount: Number,
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    open: {
        type: Boolean,
        default: false
    },
    ledger: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        stars: Number,
        points: Number
    }]
});

module.exports = mongoose.model('Team', teamSchema, 'Teams');