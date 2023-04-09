'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const messageSchema = mongoose.Schema({
    //who is the message for?
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    title: String,
    stars: {
        type: Number,
        default: 0
    }
});

messageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Message', messageSchema, 'Messages');