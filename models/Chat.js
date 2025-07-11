'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatSchema = new Schema({
    // Reference to the chat room
    room: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true,
        index: true
    },
    
    // Message sender
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Message content
    message: {
        type: String,
        required: true,
        maxlength: 5000
    },
    
    // Message type
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'system'],
        default: 'text'
    },
    
    // File attachment if any
    attachment: {
        url: String,
        filename: String,
        size: Number,
        mimeType: String
    },
    
    // Users who have seen this message
    seenBy: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        seenAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Message status
    status: {
        type: String,
        enum: ['sent', 'delivered', 'failed'],
        default: 'sent'
    },
    
    // Edit history
    edited: {
        type: Boolean,
        default: false
    },
    
    editedAt: Date,
    
    // Soft delete
    deleted: {
        type: Boolean,
        default: false
    },
    
    deletedAt: Date,
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient message retrieval
ChatSchema.index({ room: 1, createdAt: -1 });
ChatSchema.index({ sender: 1, createdAt: -1 });

// Method to mark message as seen by a user
ChatSchema.methods.markAsSeenBy = async function(userId) {
    const alreadySeen = this.seenBy.some(s => s.user.toString() === userId.toString());
    
    if (!alreadySeen) {
        this.seenBy.push({
            user: userId,
            seenAt: new Date()
        });
        await this.save();
    }
    
    return this;
};

// Virtual for checking if message is seen by a specific user
ChatSchema.virtual('isSeenBy').get(function() {
    return (userId) => {
        return this.seenBy.some(s => s.user.toString() === userId.toString());
    };
});

// Static method to get recent messages for a room
ChatSchema.statics.getRecentMessages = async function(roomId, limit = 50, before = null) {
    const query = {
        room: roomId,
        deleted: false
    };
    
    if (before) {
        query.createdAt = { $lt: before };
    }
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('sender', 'username avatar')
        .exec();
};

const Chat = mongoose.model('Chat', ChatSchema);
module.exports = { Chat };