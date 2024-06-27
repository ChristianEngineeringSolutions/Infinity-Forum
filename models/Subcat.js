'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const subcatSchema = mongoose.Schema({
    //who is the subcat for?
    tracker: Number,
    name: String,
    parentTracker: Number,
    desc: String
});

subcatSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Subcat', subcatSchema, 'Subcategories');