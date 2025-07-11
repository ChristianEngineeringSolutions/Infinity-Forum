'use strict';

const ChatService = require('../services/chatService');
const { User } = require('../models/User');
const { ChatRoom } = require('../models/ChatRoom');

/**
 * Initialize Socket.IO chat handlers
 */
function initializeChatSocket(io, sessionMiddleware) {
    // Namespace for chat
    const chatNamespace = io.of('/chat');
    
    // Apply session middleware to namespace
    if (sessionMiddleware) {
        chatNamespace.use(sessionMiddleware);
    }
    
    // Middleware to authenticate socket connections
    chatNamespace.use(async (socket, next) => {
        console.log('Chat socket authentication middleware');
        console.log('Socket handshake:', socket.handshake);
        const session = socket.request.session || socket.handshake.session;
        console.log('Session exists:', !!session);
        console.log('Session user:', session?.user);
        console.log('Full session object:', session);
        
        if (!session || !session.user) {
            console.error('No session or user found');
            console.error('Request headers:', socket.request.headers);
            return next(new Error('Authentication required'));
        }
        
        // Attach user to socket
        socket.userId = session.user._id;
        socket.user = session.user;
        console.log('Socket authenticated for user:', socket.user.username);
        next();
    });
    
    chatNamespace.on('connection', async (socket) => {
        console.log(`User ${socket.user.username} connected to chat`);
        
        // Update user's socket ID and status
        await User.findByIdAndUpdate(socket.userId, {
            socketId: socket.id,
            chatStatus: 'available',
            lastSeenAt: new Date()
        });
        
        // Join user to all their rooms
        const rooms = await ChatRoom.find({ participants: socket.userId });
        rooms.forEach(room => {
            socket.join(room._id.toString());
        });
        
        // Notify contacts that user is online
        socket.broadcast.emit('user:online', {
            userId: socket.userId,
            username: socket.user.username,
            status: 'available'
        });
        
        /**
         * Handle sending messages
         */
        socket.on('message:send', async (data) => {
            try {
                const { roomId, message, type = 'text', attachment = null } = data;
                
                // Send message through service
                const result = await ChatService.sendMessage(
                    roomId,
                    socket.userId,
                    message,
                    type,
                    attachment
                );
                
                // Log what we're sending
                console.log('Message from service:', result.message);
                console.log('Sender populated?:', result.message.sender);
                
                // Emit to all room participants
                chatNamespace.to(roomId).emit('message:new', {
                    room: roomId,
                    message: result.message
                });
                
                // Send push notifications to offline users
                const room = await ChatRoom.findById(roomId).populate('participants');
                const offlineParticipants = room.participants.filter(p => 
                    p._id.toString() !== socket.userId.toString() && !p.socketId
                );
                
                // Emit notification event for offline users
                offlineParticipants.forEach(participant => {
                    chatNamespace.emit('notification:message', {
                        userId: participant._id,
                        room: room,
                        message: result.message,
                        sender: socket.user
                    });
                });
                
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('message:error', {
                    error: error.message
                });
            }
        });
        
        /**
         * Handle typing indicators
         */
        socket.on('typing:start', async (data) => {
            const { roomId } = data;
            socket.to(roomId).emit('typing:user', {
                roomId: roomId,
                userId: socket.userId,
                username: socket.user.username,
                typing: true
            });
        });
        
        socket.on('typing:stop', async (data) => {
            const { roomId } = data;
            socket.to(roomId).emit('typing:user', {
                roomId: roomId,
                userId: socket.userId,
                username: socket.user.username,
                typing: false
            });
        });
        
        /**
         * Handle marking messages as read
         */
        socket.on('message:read', async (data) => {
            try {
                const { roomId } = data;
                await ChatService.markRoomAsRead(roomId, socket.userId);
                
                // Notify other participants
                socket.to(roomId).emit('message:seen', {
                    roomId: roomId,
                    userId: socket.userId
                });
            } catch (error) {
                console.error('Error marking as read:', error);
            }
        });
        
        /**
         * Handle status updates
         */
        socket.on('status:update', async (data) => {
            try {
                const { status, statusMessage } = data;
                const user = await ChatService.updateUserStatus(
                    socket.userId, 
                    status, 
                    statusMessage
                );
                
                // Broadcast status change to all connected users
                socket.broadcast.emit('user:status', {
                    userId: socket.userId,
                    username: user.username,
                    status: user.chatStatus,
                    statusMessage: user.statusMessage
                });
            } catch (error) {
                console.error('Error updating status:', error);
                socket.emit('status:error', {
                    error: error.message
                });
            }
        });
        
        /**
         * Handle joining a room
         */
        socket.on('room:join', async (data) => {
            try {
                const { roomId } = data;
                
                // Verify user is participant
                const room = await ChatRoom.findById(roomId);
                if (!room || !room.hasParticipant(socket.userId)) {
                    throw new Error('Unauthorized');
                }
                
                socket.join(roomId);
                socket.emit('room:joined', { roomId });
                
                // Notify others in room
                socket.to(roomId).emit('user:joined', {
                    roomId: roomId,
                    userId: socket.userId,
                    username: socket.user.username
                });
            } catch (error) {
                console.error('Error joining room:', error);
                socket.emit('room:error', {
                    error: error.message
                });
            }
        });
        
        /**
         * Handle leaving a room
         */
        socket.on('room:leave', async (data) => {
            try {
                const { roomId } = data;
                const room = await ChatService.leaveRoom(roomId, socket.userId);
                
                socket.leave(roomId);
                socket.emit('room:left', { roomId });
                
                // Notify others in room
                socket.to(roomId).emit('user:left', {
                    roomId: roomId,
                    userId: socket.userId,
                    username: socket.user.username
                });
            } catch (error) {
                console.error('Error leaving room:', error);
                socket.emit('room:error', {
                    error: error.message
                });
            }
        });
        
        /**
         * Handle creating a room
         */
        socket.on('room:create', async (data) => {
            console.log("URIAH");
            try {
                const { type, name, participants } = data;
                
                let room;
                if (type === 'direct' && participants.length === 1) {
                    const otherUser = await User.findOne({ username: participants[0] });
                    if (!otherUser) {
                        throw new Error('User not found');
                    }
                    room = await ChatService.getOrCreateDirectRoom(socket.userId, otherUser._id);
                } else if (type === 'group') {
                    room = await ChatService.createGroupRoom(socket.userId, name, participants);
                } else {
                    throw new Error('Invalid room type');
                }
                
                // Join creator to room
                socket.join(room._id.toString());
                
                // Populate room data
                await room.populate('participants', 'username avatar chatStatus');
                
                socket.emit('room:created', { room });
                
                // Notify other participants to join
                room.participants.forEach(participant => {
                    if (participant._id.toString() !== socket.userId.toString() && participant.socketId) {
                        chatNamespace.to(participant.socketId).emit('room:invited', { room });
                    }
                });
            } catch (error) {
                console.error('Error creating room:', error);
                socket.emit('room:error', {
                    error: error.message
                });
            }
        });
        
        /**
         * Handle disconnect
         */
        socket.on('disconnect', async () => {
            console.log(`User ${socket.user.username} disconnected from chat`);
            
            // Update user status
            await User.findByIdAndUpdate(socket.userId, {
                socketId: null,
                lastSeenAt: new Date()
            });
            
            // Notify contacts that user is offline
            socket.broadcast.emit('user:offline', {
                userId: socket.userId,
                username: socket.user.username,
                lastSeen: new Date()
            });
        });
        
        /**
         * Handle reconnection
         */
        socket.on('reconnect', async () => {
            console.log(`User ${socket.user.username} reconnected to chat`);
            
            // Update socket ID
            await User.findByIdAndUpdate(socket.userId, {
                socketId: socket.id,
                chatStatus: 'available',
                lastSeenAt: new Date()
            });
            
            // Rejoin rooms
            const rooms = await ChatRoom.find({ participants: socket.userId });
            rooms.forEach(room => {
                socket.join(room._id.toString());
            });
            
            // Notify contacts
            socket.broadcast.emit('user:online', {
                userId: socket.userId,
                username: socket.user.username,
                status: 'available'
            });
        });
    });
    
    return chatNamespace;
}

module.exports = { initializeChatSocket };