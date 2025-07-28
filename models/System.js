'use strict';
const mongoose = require('mongoose');

const systemSchema = mongoose.Schema({
    totalStarsGiven:{
        type: Number,
        default: 0
    },
    numUsersOnboarded: {
        type: Number,
        default: 0
    },
    //last time the algorithm was updated
    lastUpdate: {
        type: Date,
        default: Date.now
    },
    //amount of funds in cents
    platformAmount: {
        type: Number,
        default: 0
    },
    userAmount: {
        type: Number,
        default: 0
    },
    leftOver: {
        type: Number,
        default: 0
    },
    //in cents
    totalPaidOut: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('System', systemSchema, 'System');