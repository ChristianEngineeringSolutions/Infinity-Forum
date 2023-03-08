'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const { v4 } = require('uuid');

const interactionSchema = mongoose.Schema({
    //author of the daemon
    keeper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //interactor
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    //for help with search /etc
    control: {
        type: Number,
        default: 0
    },
    content: String

});

module.exports = mongoose.model('Interaction', interactionSchema, 'Interactions');