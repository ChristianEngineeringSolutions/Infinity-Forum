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
      default: false
    },
    test: {
      type: Boolean,
      default: false
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
    name: {
      type: String,
      default: ''
    },
    thumbnail: {
      type: String,
      default: ''
    },
    about: {
      type: String,
      default: ''
    },
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
    token: {
      type: String,
      default: ''
    },
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
    },
    stripeOnboardingComplete: {
      type: Boolean,
      default: false
    },
    recoveryToken: {
      type: String,
      default: ''
    },
    recoveryExp: {
      type: Date,
      default: null
    },
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
module.exports = {
  User: mongoose.model('User', userSchema, 'Users'),
  UserSchema: userSchema
};