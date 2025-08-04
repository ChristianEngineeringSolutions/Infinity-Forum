'use strict';

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requiresLogin } = require('../middleware/auth');

// Render chat interface
router.get('/chat', requiresLogin, chatController.renderChat);

// API endpoints
router.get('/api/chat/rooms', requiresLogin, chatController.getUserRooms);
router.post('/api/chat/rooms', requiresLogin, chatController.createRoom);
router.get('/api/chat/rooms/:roomId/messages', requiresLogin, chatController.getMessages);
router.post('/api/chat/rooms/:roomId/messages', requiresLogin, chatController.sendMessage);
router.post('/api/chat/rooms/:roomId/read', requiresLogin, chatController.markRoomAsRead);
router.post('/api/chat/rooms/:roomId/participants', requiresLogin, chatController.addParticipants);
router.post('/api/chat/rooms/:roomId/leave', requiresLogin, chatController.leaveRoom);
router.delete('/api/chat/messages/:messageId', requiresLogin, chatController.deleteMessage);
router.get('/api/chat/search', requiresLogin, chatController.searchMessages);
router.get('/api/chat/contacts/online', requiresLogin, chatController.getOnlineContacts);
router.put('/api/chat/status', requiresLogin, chatController.updateStatus);

module.exports = router;