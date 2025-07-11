'use strict';

const ChatService = require('../services/chatService');
const { ChatRoom } = require('../models/ChatRoom');
const { Chat } = require('../models/Chat');
const { User } = require('../models/User');

const chatController = {
    /**
     * Render chat interface
     */
    async renderChat(req, res) {
        try {
            const userId = req.session.user._id;
            const rooms = await ChatService.getUserRooms(userId, true);
            
            res.render('chat', {
                user: req.session.user,
                rooms: rooms,
                page: 'chat'
            });
        } catch (error) {
            console.error('Error rendering chat:', error);
            res.status(500).send('Error loading chat');
        }
    },

    /**
     * Get user's chat rooms
     */
    async getUserRooms(req, res) {
        try {
            const userId = req.session.user._id;
            const rooms = await ChatService.getUserRooms(userId, true);
            
            res.json({
                success: true,
                rooms: rooms
            });
        } catch (error) {
            console.error('Error getting user rooms:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Create a new chat room (group or direct)
     */
    async createRoom(req, res) {
        try {
            const userId = req.session.user._id;
            const { type, name, participants } = req.body;
            
            let room;
            
            if (type === 'direct' && participants.length === 1) {
                // Get or create direct message room
                const otherUser = await User.findOne({ username: participants[0] });
                if (!otherUser) {
                    return res.status(404).json({
                        success: false,
                        error: 'User not found'
                    });
                }
                room = await ChatService.getOrCreateDirectRoom(userId, otherUser._id);
            } else if (type === 'group') {
                // Create group room
                room = await ChatService.createGroupRoom(userId, name, participants);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid room type'
                });
            }
            
            // Populate room data
            await room.populate('participants', 'username avatar chatStatus');
            
            res.json({
                success: true,
                room: room
            });
        } catch (error) {
            console.error('Error creating room:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Get messages for a room
     */
    async getMessages(req, res) {
        try {
            const userId = req.session.user._id;
            const { roomId } = req.params;
            const { limit = 50, before = null } = req.query;
            
            const messages = await ChatService.getMessages(
                roomId, 
                userId, 
                parseInt(limit), 
                before
            );
            
            res.json({
                success: true,
                messages: messages
            });
        } catch (error) {
            console.error('Error getting messages:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Send a message
     */
    async sendMessage(req, res) {
        try {
            const userId = req.session.user._id;
            const { roomId } = req.params;
            const { message, type = 'text', attachment = null } = req.body;
            
            const result = await ChatService.sendMessage(
                roomId,
                userId,
                message,
                type,
                attachment
            );
            
            res.json({
                success: true,
                message: result.message,
                room: result.room
            });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Mark room as read
     */
    async markRoomAsRead(req, res) {
        try {
            const userId = req.session.user._id;
            const { roomId } = req.params;
            
            await ChatService.markRoomAsRead(roomId, userId);
            
            res.json({
                success: true
            });
        } catch (error) {
            console.error('Error marking room as read:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Update user status
     */
    async updateStatus(req, res) {
        try {
            const userId = req.session.user._id;
            const { status, statusMessage } = req.body;
            
            const user = await ChatService.updateUserStatus(userId, status, statusMessage);
            
            res.json({
                success: true,
                user: user
            });
        } catch (error) {
            console.error('Error updating status:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Add participants to group
     */
    async addParticipants(req, res) {
        try {
            const userId = req.session.user._id;
            const { roomId } = req.params;
            const { participants } = req.body;
            
            const room = await ChatService.addParticipants(roomId, userId, participants);
            await room.populate('participants', 'username avatar chatStatus');
            
            res.json({
                success: true,
                room: room
            });
        } catch (error) {
            console.error('Error adding participants:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Leave room
     */
    async leaveRoom(req, res) {
        try {
            const userId = req.session.user._id;
            const { roomId } = req.params;
            
            const room = await ChatService.leaveRoom(roomId, userId);
            
            res.json({
                success: true,
                room: room
            });
        } catch (error) {
            console.error('Error leaving room:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Search messages
     */
    async searchMessages(req, res) {
        try {
            const userId = req.session.user._id;
            const { q, limit = 20 } = req.query;
            
            if (!q || q.trim().length < 2) {
                return res.json({
                    success: true,
                    messages: []
                });
            }
            
            const messages = await ChatService.searchMessages(userId, q, parseInt(limit));
            
            res.json({
                success: true,
                messages: messages
            });
        } catch (error) {
            console.error('Error searching messages:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Delete message
     */
    async deleteMessage(req, res) {
        try {
            const userId = req.session.user._id;
            const { messageId } = req.params;
            
            const message = await ChatService.deleteMessage(messageId, userId);
            
            res.json({
                success: true,
                message: message
            });
        } catch (error) {
            console.error('Error deleting message:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Get online contacts
     */
    async getOnlineContacts(req, res) {
        try {
            const userId = req.session.user._id;
            const contacts = await ChatService.getOnlineContacts(userId);
            
            res.json({
                success: true,
                contacts: contacts
            });
        } catch (error) {
            console.error('Error getting online contacts:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
};

module.exports = chatController;