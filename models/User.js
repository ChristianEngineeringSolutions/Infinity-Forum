'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const bcrypt = require('bcrypt');

const userSchema = mongoose.Schema({
    joined: {type: Date, default: Date.now},
    age: {
      type: Number,
      default: 0
    },
    safeMode: {
      type: Boolean,
      default: true
    },
    email: {
        type: String,
        unique: true,
        required: false,
        trim: true
      },
      username: {
        type: String,
        unique: true,
        required: true,
        trim: true
      },
      password: {
        type: String,
        required: true,
      },
    name: String,
    thumbnail: String,
    about: String,
    developer: {
      type: Boolean,
      default: false
    },
    admin: {
      type: Boolean,
      default: false
    },
    verified: {
      type: Boolean,
      default: false
    },
    developerMode: {
      type: Boolean,
      default: false
    },
    stars: {
        type: Number,
        default: 0
    },
    starsGiven: {
        type: Number,
        default: 0
    },
    token: String,
    deleted: {
        type: Boolean,
        default: false
    },
    subscribed: {
      type: Boolean,
      default: false
    },
    bookmarks: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passage'
    }],
    // Background scripts
    daemons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passage'
    }],
    tabs: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passage'
    }],
    stripeAccountId: {
      type: String,
      default: null
    },
    canReceivePayouts: {
      type: Boolean,
      default: false
    },
    subscriptionID: {
      type: String,
      default: null
    },
    lastSubscribed: {type: Date, default: null},
    room: {
      type: String,
      default: 'root'
    }, //handle sockets by passage
    stripeOnboardingComplete: {
      type: Boolean,
      default: false
    },
    recoveryToken: String,
    recoveryExp: Date,
    amountEarned: {
        type: Number,
        default: 0
    },
    amountEarnedThisYear: {
        type: Number,
        default: 0
    },
    paymentsLocked: {
      type: Boolean,
      default: false
    },

});
userSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('User', userSchema, 'Users');