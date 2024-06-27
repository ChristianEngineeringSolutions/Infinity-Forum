'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const categorySchema = mongoose.Schema({
    //who is the category for?
    tracker: Number,
    name: String,
});

categorySchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Category', categorySchema, 'Categories');