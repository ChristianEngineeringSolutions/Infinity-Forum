'use strict';

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requiresLogin } = require('../middleware/auth');

// All chat routes require login
router.use(requiresLogin);

// Render chat interface
router.get('/chat', chatController.renderChat);

// API endpoints
router.get('/api/chat/rooms', chatController.getUserRooms);
router.post('/api/chat/rooms', chatController.createRoom);
router.get('/api/chat/rooms/:roomId/messages', chatController.getMessages);
router.post('/api/chat/rooms/:roomId/messages', chatController.sendMessage);
router.post('/api/chat/rooms/:roomId/read', chatController.markRoomAsRead);
router.post('/api/chat/rooms/:roomId/participants', chatController.addParticipants);
router.post('/api/chat/rooms/:roomId/leave', chatController.leaveRoom);
router.delete('/api/chat/messages/:messageId', chatController.deleteMessage);
router.get('/api/chat/search', chatController.searchMessages);
router.get('/api/chat/contacts/online', chatController.getOnlineContacts);
router.put('/api/chat/status', chatController.updateStatus);

module.exports = router;