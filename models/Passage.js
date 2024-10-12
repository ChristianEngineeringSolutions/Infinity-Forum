'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const { v4 } = require('uuid');

const passageSchema = mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    //author is first user
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    //who wants notifications
    watching: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    starrers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    interactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interaction'
    }],
    versions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    versionOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    uuid: {
        type: String,
        default: () => v4()
    },
    title: {
        type: String,
        default: ''
        // index: true
    },
    forumSpecial: {
        type: Boolean,
        default: false
    },
    //to help user apps (store JSON)
    metadata: String,
    html: {
        type: String,
        default: ''
    },
    css: {
        type: String,
        default: ''
    },
    javascript: {
        type: String,
        default: ''
    },
    libs: {
        type: String,
        default: ``
    }, //included libs for JS, for starting synthetic passages
    //for daemons:
    param: String,
    //to replace html/css/javascript
    code: {
        type: String,
        default: ''
        // index: true
    },
    bibliography: String,
    //can be enabled by default in passage settings
    distraction_free: {
        type: Boolean,
        default: false
    },
    pinned: {
        type: Boolean,
        default: false
    },
    flagged: {
        type: Boolean,
        default: false
    },
    //bubble up content/code? Passage setting option
    bubbling: {
        type: Boolean,
        default: false
    },
    lang: {
        type: String,
        default: 'rich'
    },
    fileStreamPath: {
        type: String,
        default: null,
    },
    //there can only be one mainFile for each fileStreamPath
    mainFile: {
        type: Boolean,
        default: false
    },
    comment: {
        type: Boolean,
        default: false
    },
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
    //Send them to the server with the sources if they are external
    sourceLink: String,
    //for keeping track of contributors peer to peer or from local pushes
    collaborators: {
        type: [String],
        default: []
    },
    content: {
        type: String,
        default: ''
        // index: true
    },
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
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    subforums: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    // daemons to be used as functions in passage
    daemons: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    // 
    input: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    }],
    output: String,
    //result of evaluating the output
    final: String,
    //date of creation
    date: {type: Date, default: Date.now},
    parentTracker: Number, //For Forum,
    tracker: Number,
    forumType: String, //category, subcat, subforum
    stickied: {
        type: Boolean,
        default: false
    },
    sub: {
        type: Boolean,
        default: false
    }, //subforum or not
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
    admin: {
        type: Boolean,
        default: false
    }, //content warning
    filename: [String], // associated file
    filenames: [String], //If we go with file upload multiple
    thumbnail: String, //For models, vids, etc.
    mimeType: [String],
    deleted: {
        type: Boolean,
        default: false
    },
    //permissions/settings
    public: {
        type: Boolean,
        default: false
    },
    forum: {
        type: Boolean,
        default: false
    },
    // Only author/users can even view
    personal: {
        type: Boolean,
        default: false
    },
    // allow same origin iframes
    personal_cross_origin: {
        type: Boolean,
        default: false
    },
    //Made by the AI?
    synthetic: {
        type: Boolean,
        default: false
    },
    //0 is false, 1 is requesting, 2 is active
    public_daemon: {
        type: Number,
        default: 0
    },
    admin_make_daemon: {
        type: Boolean,
        default: false
    },
    // Makes it a daemon for all users by default
    default_daemon: {
        type: Boolean,
        default: false
    },
    isSVG: {
        type: Boolean,
        default: false
    },
    license: String,
    isPorn: {
        type: [Number],
        default: [0]
    },
    isHentai: {
        type: [Number],
        default: [0]
    },
    toggle: {
        type: Boolean,
        default: false
    },
    mirror: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    bestOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
    mirrorContent: {
        type: Boolean,
        default: false
    },
    bestOfContent: {
        type: Boolean,
        default: false
    },
    mirrorEntire: {
        type: Boolean,
        default: false
    },
    bestOfEntire: {
        type: Boolean,
        default: false
    }

});
var autoPopulateChildren = function(next) {
    this.populate('passages');
    this.populate('author');
    // this.populate('parent');
    next();
};
// passageSchema.index({
//     title: "text",
//     content: "text",
//     code: "text"
// });
passageSchema
.pre('findOne', autoPopulateChildren)
.pre('find', autoPopulateChildren)
passageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Passage', passageSchema, 'Passages');