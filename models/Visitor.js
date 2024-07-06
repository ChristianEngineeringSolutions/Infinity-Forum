'use strict';
const mongoose = require('mongoose');
const visitorSchema = mongoose.Schema({
  ipAddress: String,
  visitedAt: { type: Date, default: Date.now },
  user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
  visited: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
});
module.exports = mongoose.model('Visitor', visitorSchema, 'Visitors');