'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const dealSchema = mongoose.Schema({
    //who started the deal
    starter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    //is the deal active and valid?
    valid: {
        type: Boolean,
        default: false
    },
    created: {type: Date, default: Date.now},
});

dealSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Deal', dealSchema, 'Deals');