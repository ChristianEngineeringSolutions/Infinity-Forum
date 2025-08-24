'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const microDealSchema = mongoose.Schema({
    deal: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    },
    //person authoring the micro deal
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //person the deal is being made with
    contributor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //who has agreed with the deal
    agrees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    created: {type: Date, default: Date.now},
    contract: String,
    paymentOption: String,
    paymentAmount: Number,
    paymentPercentage: Number,
    general: {
        type: Boolean,
        default: false
    }
});

microDealSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('MicroDeal', microDealSchema, 'MicroDeals');