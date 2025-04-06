'use strict';
const mongoose = require('mongoose');

const JTISchema = mongoose.Schema({
    JTI: String,
    attempted: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('JTI', JTISchema, 'JTIs');