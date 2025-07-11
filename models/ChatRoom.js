'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatRoomSchema = new Schema({
    // Room name/topic for group chats
    name: {
        type: String,
        default: ''
    },
    
    // Type of chat room
    type: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct'
    },
    
    // Users in the chat room
    participants: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // Creator of the group chat (null for direct messages)
    creator: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    
    // Last message for sorting by recency
    lastMessage: {
        type: Schema.Types.ObjectId,
        ref: 'Chat',
        default: null
    },
    
    // Timestamp of last activity
    lastActivity: {
        type: Date,
        default: Date.now
    },
    
    // Track which users have seen the latest messages
    unreadBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // Room settings
    settings: {
        muteNotifications: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            until: Date
        }]
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient queries
ChatRoomSchema.index({ participants: 1, lastActivity: -1 });
ChatRoomSchema.index({ 'unreadBy': 1 });

// Method to check if a user is a participant
ChatRoomSchema.methods.hasParticipant = function(userId) {
    return this.participants.some(p => p.toString() === userId.toString());
};

// Method to mark as read by a user
ChatRoomSchema.methods.markAsReadBy = async function(userId) {
    this.unreadBy = this.unreadBy.filter(id => id.toString() !== userId.toString());
    return this.save();
};

// Method to mark as unread for all except sender
ChatRoomSchema.methods.markAsUnreadExcept = async function(senderId) {
    this.unreadBy = this.participants.filter(id => id.toString() !== senderId.toString());
    return this.save();
};

// Static method to find or create direct chat room
ChatRoomSchema.statics.findOrCreateDirect = async function(user1Id, user2Id) {
    // Sort IDs to ensure consistent lookup
    const sortedIds = [user1Id, user2Id].sort();
    
    let room = await this.findOne({
        type: 'direct',
        participants: { $all: sortedIds, $size: 2 }
    }).populate('participants', 'username avatar chatStatus');
    
    if (!room) {
        room = await this.create({
            type: 'direct',
            participants: sortedIds,
            unreadBy: []
        });
        // Populate the newly created room
        room = await this.findById(room._id).populate('participants', 'username avatar chatStatus');
    }
    
    return room;
};

const ChatRoom = mongoose.model('ChatRoom', ChatRoomSchema);
module.exports = { ChatRoom };