'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const teamSchema = mongoose.Schema({
    name: String,
    leader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rootPassage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
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
        points: Number,
        options: {
            useGeneralStars: Boolean
        }
    }],
    dateCreated: {type: Date, default: Date.now},
    totalPoints: {
        type: Number,
        default: 0
    },
    description: String
});

teamSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Team', teamSchema, 'Teams');