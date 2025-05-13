'use strict';
const mongoose = require('mongoose');
const verificationSessionSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: String,
    created: Date,
    lastUpdated: Date,
    stripeVerificationId: String,
    documentHash: String,
    documentType: String,
    verifiedAt: Date,
    verificationStatus: String,
});

module.exports = mongoose.model('VerificationSession', verificationSessionSchema, 'VerificationSessions');