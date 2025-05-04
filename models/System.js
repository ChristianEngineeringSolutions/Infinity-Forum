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
    }
});

module.exports = mongoose.model('System', systemSchema, 'System');