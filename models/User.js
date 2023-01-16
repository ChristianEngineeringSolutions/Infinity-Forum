'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const bcrypt = require('bcrypt');

const userSchema = mongoose.Schema({
    joined: {type: Date, default: Date.now},
    email: {
        type: String,
        unique: true,
        required: true,
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
    verified: {
      type: Boolean,
      default: false
    },
    developerMode: {
      type: Boolean,
      default: false
    },
    //You can give away twice as many stars as you have
    stars: {
        type: Number,
        default: 1
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
    // Background scripts
    daemons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passage'
    }]
});

module.exports = mongoose.model('User', userSchema, 'Users');