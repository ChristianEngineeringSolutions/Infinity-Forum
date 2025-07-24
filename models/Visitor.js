'use strict';
const mongoose = require('mongoose');
const visitorSchema = mongoose.Schema({
  ipAddress: String,
  ipNumber: {
      type: Number,
      default: 0
    },
  visitedAt: {
      type: Date,
      default: Date.now
    },
  user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
  visited: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passage'
    },
  viewType: {
      type: String,
      enum: ['page', 'video_complete', 'video_partial', 'youtube_embed'],
      default: 'page'
    },
  duration: Number, // milliseconds watched for videos
  totalDuration: Number, // total video length in milliseconds
  fingerprint: String, // browser fingerprint hash
  deviceFingerprint: String, // device-specific fingerprint (screen, hardware)
  browserFingerprint: String, // browser-specific fingerprint (canvas, audio)
  sessionId: String, // session tracking cookie
  cookieId: String, // persistent viewer cookie
  lastViewedAt: Date, // for preventing rapid repeats
  viewCount: {
      type: Number,
      default: 1
    },
  isAuthenticated: Boolean,
  userAgent: String,
  referrer: String,
  metadata: mongoose.Schema.Types.Mixed // for storing additional data like YouTube video IDs
});

// Indexes for efficient queries
visitorSchema.index({ user: 1, visited: 1, viewType: 1, visitedAt: -1 });
visitorSchema.index({ cookieId: 1, visited: 1, viewType: 1, visitedAt: -1 });
visitorSchema.index({ visited: 1, viewType: 1, visitedAt: -1 });
visitorSchema.index({ fingerprint: 1, ipNumber: 1, visited: 1 });
visitorSchema.index({ visitedAt: 1 }); // for cleanup of old records

module.exports = mongoose.model('Visitor', visitorSchema, 'Visitors');