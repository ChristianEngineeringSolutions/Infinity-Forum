'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const bcrypt = require('bcrypt');

const userSchema = mongoose.Schema({
    joined: {type: Date, default: Date.now},
    lastLogin: {type: Date, default: Date.now},
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
        trim: true,
        maxLength: 566836
      },
      username: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        maxLength: 566836
      },
      password: {
        type: String,
        required: true,
        maxLength: 566836
      },
    name: {
      type: String,
      default: '',
      maxLength: 566836
    },
    thumbnail: {
      type: String,
      default: ''
    },
    about: {
      type: String,
      default: '',
      maxLength: 566836
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
    subscriptionQuantity: {
      type: Number,
      default: 0
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
    phone: {
      type: String,
      default: ''
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
    borrowedStars: {
        type: Number,
        default: 0
    },
    monthStarsBorrowed: {
      type: Date,
      default: null
    },
    starsBorrowedThisMonth: {
      type: Number,
      default: 0
    },
    identityVerified: {
      type: Boolean,
      default: false
    },
    verificationLevel: {
      type: String,
      default: ''
    },
    lastVerifiedAt: Date,
    duplicateDetected: {
      type: Boolean,
      default: null
    }
});

userSchema.plugin(mongoosePaginate);
module.exports = {
  User: mongoose.model('User', userSchema, 'Users'),
  UserSchema: userSchema
};