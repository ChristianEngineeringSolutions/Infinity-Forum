'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const subforumSchema = mongoose.Schema({
    //who is the subforum for?
    parentTracker: Number,
    tracker: Number,
    name: String,
});

subforumSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Subforum', subforumSchema, 'Subforums');