'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

const passageSchema = mongoose.Schema({
    //
    systemRecord: {
        type: Boolean,
        default: false
    },
    //author is first user
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    //rrr, wwww, xxx, etc., ordered by users
    // [rwx, ...]
    permissions: [String],
    title: String,
    html: String,
    css: String,
    javascript: String,
    // tags: [{
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Tag'
    // }],
    tags: String, //["tag1", "tag2", "tag3", ...]
    /**
     * {
     *  "tag1": {
     *          reputation: Number //from user reputation on bump
     *      }
     * }
     */
    /** tags.join('') => Regex $search */
    // From original to previous passage source
    sourceList : [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    //alternate list
    alternates : [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    content: String,
    //forces content to be a unique value unless null
    // content: {
    //     type: String,
    //     index: {
    //         unique: true,
    //         partialFilterExpression: {content: {$type: "string"}}
    //     }
    // },
    //chapter the passage belongs to
    // chapter: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Chapter'
    // },
    //parent passage the passage belongs to
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    // sub passages under this passage
    passages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    //date of creation
    date: {type: Date, default: Date.now},
    //date last updated
    updated: {type: Date, default: Date.now},
    stars: {
        type: Number,
        default: 0
    },
    crossOriginAllowed: {
        type: Boolean,
        default: false
    },
    flagged: {
        type: Boolean,
        default: false
    }, //content warning
    filename: String, // associated file
    deleted: {
        type: Boolean,
        default: false
    },
    //quill, codeMirror, etc.
    editor: String,
});
var autoPopulateChildren = function(next) {
    this.populate('passages');
    next();
};

passageSchema
.pre('findOne', autoPopulateChildren)
.pre('find', autoPopulateChildren)
passageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Passage', passageSchema, 'Passages');