'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const commentSchema = mongoose.Schema({
    
});

commentSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Comment', commentSchema, 'Comments');