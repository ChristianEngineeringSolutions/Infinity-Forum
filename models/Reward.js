'use strict';
const mongoose = require('mongoose');

const rewardSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    parentPassage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    selectedAnswer: {
        type: Boolean,
        default: false
    }

});

module.exports = mongoose.model('Reward', rewardSchema, 'Rewards');