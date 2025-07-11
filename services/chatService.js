'use strict';

const { ChatRoom } = require('../models/ChatRoom');
const { Chat } = require('../models/Chat');
const { User } = require('../models/User');

class ChatService {
    /**
     * Create or get a direct message room between two users
     */
    static async getOrCreateDirectRoom(user1Id, user2Id) {
        return await ChatRoom.findOrCreateDirect(user1Id, user2Id);
    }

    /**
     * Create a new group chat room
     */
    static async createGroupRoom(creatorId, name, participantUsernames) {
        // Find users by username
        const users = await User.find({
            username: { $in: participantUsernames }
        }).select('_id');
        
        const participantIds = users.map(u => u._id);
        
        // Add creator to participants if not already included
        if (!participantIds.some(id => id.toString() === creatorId.toString())) {
            participantIds.push(creatorId);
        }
        
        // Create the group room
        const room = await ChatRoom.create({
            name: name || 'Group Chat',
            type: 'group',
            participants: participantIds,
            creator: creatorId,
            unreadBy: participantIds.filter(id => id.toString() !== creatorId.toString())
        });
        
        return room;
    }

    /**
     * Send a message to a chat room
     */
    static async sendMessage(roomId, senderId, messageText, type = 'text', attachment = null) {
        // Verify sender is a participant
        const room = await ChatRoom.findById(roomId);
        if (!room || !room.hasParticipant(senderId)) {
            throw new Error('Unauthorized: User is not a participant in this room');
        }
        
        // Create the message
        const message = await Chat.create({
            room: roomId,
            sender: senderId,
            message: messageText,
            type: type,
            attachment: attachment,
            seenBy: [{
                user: senderId,
                seenAt: new Date()
            }]
        });
        
        // Update room's last message and activity
        room.lastMessage = message._id;
        room.lastActivity = new Date();
        
        // Mark as unread for all participants except sender
        await room.markAsUnreadExcept(senderId);
        
        // Populate sender info before returning
        // Need to re-fetch the message to ensure proper population
        const populatedMessage = await Chat.findById(message._id)
            .populate('sender', 'username avatar');
        
        return { message: populatedMessage, room };
    }

    /**
     * Get messages for a chat room with pagination
     */
    static async getMessages(roomId, userId, limit = 50, before = null) {
        // Verify user is a participant
        const room = await ChatRoom.findById(roomId);
        if (!room || !room.hasParticipant(userId)) {
            throw new Error('Unauthorized: User is not a participant in this room');
        }
        
        // Get messages
        const messages = await Chat.getRecentMessages(roomId, limit, before);
        
        // Mark room as read by user
        await room.markAsReadBy(userId);
        
        // Mark recent messages as seen
        const unseenMessages = messages.filter(m => !m.isSeenBy(userId));
        await Promise.all(unseenMessages.map(m => m.markAsSeenBy(userId)));
        
        return messages.reverse(); // Return in chronological order
    }

    /**
     * Get all chat rooms for a user sorted by recency
     */
    static async getUserRooms(userId, includeUnreadCount = true) {
        const rooms = await ChatRoom.find({
            participants: userId
        })
        .sort({ lastActivity: -1 })
        .populate('participants', 'username avatar chatStatus')
        .populate('lastMessage', 'message sender createdAt')
        .populate('creator', 'username');
        
        if (includeUnreadCount) {
            // Add unread status for each room
            return rooms.map(room => ({
                ...room.toObject(),
                isUnread: room.unreadBy.some(id => id.toString() === userId.toString()),
                unreadCount: room.unreadBy.includes(userId) ? 1 : 0 // Can be enhanced to count actual unread messages
            }));
        }
        
        return rooms;
    }

    /**
     * Mark all messages in a room as read
     */
    static async markRoomAsRead(roomId, userId) {
        const room = await ChatRoom.findById(roomId);
        if (!room || !room.hasParticipant(userId)) {
            throw new Error('Unauthorized: User is not a participant in this room');
        }
        
        // Mark room as read
        await room.markAsReadBy(userId);
        
        // Mark all unseen messages as seen
        const messages = await Chat.find({
            room: roomId,
            'seenBy.user': { $ne: userId }
        });
        
        await Promise.all(messages.map(m => m.markAsSeenBy(userId)));
        
        return true;
    }

    /**
     * Update user chat status
     */
    static async updateUserStatus(userId, status, statusMessage = null) {
        const validStatuses = ['available', 'away', 'busy', 'invisible'];
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status');
        }
        
        const updateData = {
            chatStatus: status,
            lastSeenAt: new Date()
        };
        
        if (statusMessage !== null) {
            updateData.statusMessage = statusMessage;
        }
        
        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('username chatStatus statusMessage lastSeenAt');
        
        return user;
    }

    /**
     * Add participants to a group chat
     */
    static async addParticipants(roomId, requesterId, usernamesToAdd) {
        const room = await ChatRoom.findById(roomId);
        
        // Verify it's a group chat and requester is authorized
        if (!room || room.type !== 'group') {
            throw new Error('Invalid room or not a group chat');
        }
        
        if (!room.hasParticipant(requesterId)) {
            throw new Error('Unauthorized: User is not a participant');
        }
        
        // Find users to add
        const usersToAdd = await User.find({
            username: { $in: usernamesToAdd }
        }).select('_id');
        
        const newParticipantIds = usersToAdd
            .map(u => u._id)
            .filter(id => !room.participants.includes(id));
        
        if (newParticipantIds.length === 0) {
            return room; // No new participants to add
        }
        
        // Add new participants
        room.participants.push(...newParticipantIds);
        room.unreadBy.push(...newParticipantIds);
        await room.save();
        
        // Create system message about new participants
        await Chat.create({
            room: roomId,
            sender: requesterId,
            message: `Added ${newParticipantIds.length} new participant(s) to the group`,
            type: 'system'
        });
        
        return room;
    }

    /**
     * Leave a chat room
     */
    static async leaveRoom(roomId, userId) {
        const room = await ChatRoom.findById(roomId);
        
        if (!room || !room.hasParticipant(userId)) {
            throw new Error('Invalid room or user not a participant');
        }
        
        if (room.type === 'direct') {
            throw new Error('Cannot leave a direct message room');
        }
        
        // Remove user from participants
        room.participants = room.participants.filter(
            p => p.toString() !== userId.toString()
        );
        room.unreadBy = room.unreadBy.filter(
            p => p.toString() !== userId.toString()
        );
        
        // If no participants left, delete the room
        if (room.participants.length === 0) {
            await ChatRoom.findByIdAndDelete(roomId);
            await Chat.deleteMany({ room: roomId });
            return null;
        }
        
        await room.save();
        
        // Create system message
        const user = await User.findById(userId).select('username');
        await Chat.create({
            room: roomId,
            sender: userId,
            message: `${user.username} left the group`,
            type: 'system'
        });
        
        return room;
    }

    /**
     * Search messages in user's rooms
     */
    static async searchMessages(userId, searchTerm, limit = 20) {
        // Get user's rooms
        const rooms = await ChatRoom.find({
            participants: userId
        }).select('_id');
        
        const roomIds = rooms.map(r => r._id);
        
        // Search messages
        const messages = await Chat.find({
            room: { $in: roomIds },
            message: { $regex: searchTerm, $options: 'i' },
            deleted: false
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('sender', 'username avatar')
        .populate('room', 'name type participants');
        
        return messages;
    }

    /**
     * Delete a message (soft delete)
     */
    static async deleteMessage(messageId, userId) {
        const message = await Chat.findById(messageId);
        
        if (!message || message.sender.toString() !== userId.toString()) {
            throw new Error('Unauthorized: Cannot delete this message');
        }
        
        message.deleted = true;
        message.deletedAt = new Date();
        await message.save();
        
        return message;
    }

    /**
     * Get online users from a user's contacts
     */
    static async getOnlineContacts(userId) {
        // Get all rooms the user is in
        const rooms = await ChatRoom.find({
            participants: userId
        }).populate('participants', 'username chatStatus lastSeenAt socketId');
        
        // Extract unique contacts
        const contactsMap = new Map();
        
        rooms.forEach(room => {
            room.participants.forEach(participant => {
                if (participant._id.toString() !== userId.toString()) {
                    contactsMap.set(participant._id.toString(), participant);
                }
            });
        });
        
        // Filter online contacts (have socketId or recent lastSeenAt)
        const onlineContacts = Array.from(contactsMap.values()).filter(contact => {
            if (contact.chatStatus === 'invisible') return false;
            if (contact.socketId) return true;
            
            // Consider online if seen in last 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            return contact.lastSeenAt > fiveMinutesAgo;
        });
        
        return onlineContacts;
    }
}

module.exports = ChatService;