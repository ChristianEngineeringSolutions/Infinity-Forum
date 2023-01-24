'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const messageSchema = mongoose.Schema({
    //who is the message for?
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //from?
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    subject: String,
    content: String,
    //date of creation
    date: {type: Date, default: Date.now},
});

messageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Message', messageSchema, 'Messages');