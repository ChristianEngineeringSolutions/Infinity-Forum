'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const { v4 } = require('uuid');

const passageSchema = mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    //author is first user
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    //has medium size alternate image
    medium: {
        type: [String],
        default: []
    },
    //use original filepath if false, orig or medium if true
    compressed: {
        type: [String],
        default: []
    },
    sameUsers: {
        type: Boolean,
        default: false
    },
    sameCollabers: {
        type: Boolean,
        default: false
    },
    sameSources: {
        type: Boolean,
        default: false
    },
    //who wants notifications
    watching: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    starrers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    interactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interaction',
        default: []
    }],
    versions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    versionOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: null
    },
    uuid: {
        type: String,
        default: () => v4()
    },
    title: {
        type: String,
        default: '',
        maxLength: 566836
        // index: true
    },
    label: {
        type: String,
        default: 'Project',
        maxLength: 566836
        // index: true
    },
    forumSpecial: {
        type: Boolean,
        default: false
    },
    showBestOf: {
        type: Boolean,
        default: false
    },
    //to help user apps (store JSON)
    metadata: {
        type: String,
        default: ''
    },
    html: {
        type: String,
        default: '',
        maxLength: 566836
    },
    css: {
        type: String,
        default: '',
        maxLength: 566836
    },
    javascript: {
        type: String,
        default: '',
        maxLength: 566836
    },
    libs: {
        type: String,
        default: ``
    }, //included libs for JS, for starting synthetic passages
    //for daemons:
    param: {
        type: String,
        default: ''
    },
    //to replace html/css/javascript
    code: {
        type: String,
        default: '',
        maxLength: 566836
        // index: true
    },
    bibliography: {
        type: String,
        default: '',
        maxLength: 566836
    },
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
    //contains a blacklisted keyword
    blacklisted: {
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
        default: 'rich',
        maxLength: 566836
    },
    fileStreamPath: {
        type: String,
        default: '',
        maxLength: 566836
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
    publicReply: {
        type: Boolean,
        default: false
    },
    // tags: [{
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Tag'
    // }],
    tags: {
        type: String,
        default: ''
    }, //["tag1", "tag2", "tag3", ...]
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
        ref: 'Passage',
        default: []
    }],
    //Send them to the server with the sources if they are external
    sourceLink: {
        type: String,
        default: ''
    },
    //for keeping track of contributors peer to peer or from local pushes
    collaborators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: []
    }],
    content: {
        type: String,
        default: '',
        maxLength: 566836
        // index: true
    },
    lastUpdated: {type: Date, default: Date.now},
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
        ref: 'Passage',
        default: null
    },
    // sub passages under this passage
    passages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    subforums: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    // daemons to be used as functions in passage
    daemons: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    alternates: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    // 
    input: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: []
    }],
    output: {
        type: String,
        default: ''
    },
    //result of evaluating the output
    final: {
        type: String,
        default: ''
    },
    //date of creation
    date: {type: Date, default: Date.now},
    parentTracker: {
        type: Number,
        default: 0
    }, //For Forum,
    tracker: {
        type: Number,
        default: 0
    },
    yt: {
        type: String,
        default: '',
        maxLength: 566836
    },
    forumType: {
        type: String,
        default: '',
        maxLength: 566836
    }, //category, subcat, subforum
    stickied: {
        type: Boolean,
        default: false
    },
    sub: {
        type: Boolean,
        default: false
    }, //subforum or not
    previewLink: {
        type: String,
        default: null,
        maxLength: 566836
    },
    stars: {
        type: Number,
        default: 0
    },
    verifiedStars: {
        type: Number,
        default: 0
    },
    lastCap: {
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
    filename: {
        type: [String],
        default: [],
        set: function(arr) {
          if (!arr) return [];
          return arr.map(str => str.slice(0, 566836)); // Truncate to 566836 chars
        }
    }, // associated file
    filenames: {
        type: [String],
        default: [],
        set: function(arr) {
          if (!arr) return [];
          return arr.map(str => str.slice(0, 566836)); // Truncate to 566836 chars
        }
    }, //If we go with file upload multiple
    thumbnail: {
        type: String,
        default: '',
        maxLength: 566836
    }, //For models, vids, etc.
    mimeType: {
        type: [String],
        default: []
    },
    deleted: {
        type: Boolean,
        default: false
    },
    //permissions/settings
    public: {
        type: Boolean,
        default: false
    },
    showBestOf: {
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
    license: {
        type: String,
        default: ''
    },
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
        ref: 'Passage',
        default: null
    },
    best: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: null
    },
    repost: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: null
    },
    bestOf: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage',
        default: null
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
    },
    //total number of stars including from subPassages
    pruneStars: {
        type: Number,
        default: 0
    },
    //for simulated/fake passages generated by faker.js
    simulated: {
        type: Boolean,
        default: false
    },
    reward: {
        type: Number,
        default: 0
    },
    price: {
        type: Number,
        default: 0
    },
    selectedAnswer: {
        type: Boolean,
        default: false
    },
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

const currentSchemaKeysArray = Object.keys(passageSchema.paths);

module.exports = {
  Passage: mongoose.model('Passage', passageSchema, 'Passages'),
  PassageSchema: passageSchema
};