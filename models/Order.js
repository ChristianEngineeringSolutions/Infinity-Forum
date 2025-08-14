'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const orderSchema = mongoose.Schema({
    title: {
        type: String,
        default: 'Untitled'
    },
    buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    chargeId: String,
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    dateSold: {type: Date, default: Date.now},
    //has the product been shipped?
    shipped: {
        type: Boolean,
        default: false
    },
    quantity: {
        type: Number,
        default: 1
    },
    carrier: {
        type: String,
        maxLength: 100
    },
    trackingNumber: {
        type: String,
        maxLength: 100
    },
    shippingService: {
        type: String,
        maxLength: 100
    }
});

orderSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Order', orderSchema, 'Orders');