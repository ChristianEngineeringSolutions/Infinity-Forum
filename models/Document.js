'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const documentSchema = mongoose.Schema({
    //plain, rich, code, markdown
    type: String,
    //quill, codeMirror, etc.
    editor: String,
    //javascript, python, etc.
    language: String,
    passage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    content: String,
    //date of creation
    date: {type: Date, default: Date.now},
});

documentSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Message', documentSchema, 'Messages');