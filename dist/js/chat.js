'use strict';

// Global variables
let socket = null;
let currentRoom = null;
let typingTimer = null;
let isTyping = false;

// Initialize chat when document is ready
$(document).ready(function() {
    initializeChat();
});

function initializeChat() {
    // Connect to chat namespace
    socket = io('/chat', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    console.log('Attempting to connect to chat socket...');
    
    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to chat server');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from chat server');
        updateConnectionStatus(false);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        console.error('Error type:', error.type);
        console.error('Error message:', error.message);
        if (error.data) {
            console.error('Error data:', error.data);
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
    
    socket.on('message:new', (data) => {
        if (data.room === currentRoom) {
            displayMessage(data.message);
            markRoomAsRead(currentRoom);
        } else {
            // Update room list to show unread indicator
            updateRoomUnreadStatus(data.room, true);
        }
        playNotificationSound();
    });
    
    socket.on('typing:user', (data) => {
        if (data.roomId === currentRoom) {
            showTypingIndicator(data.userId, data.username, data.typing);
        }
    });
    
    socket.on('user:online', (data) => {
        updateUserStatus(data.userId, 'online');
    });
    
    socket.on('user:offline', (data) => {
        updateUserStatus(data.userId, 'offline');
    });
    
    socket.on('room:created', (data) => {
        addRoomToList(data.room);
        selectRoom(data.room._id);
        closeNewChatModal();
    });
    
    socket.on('room:invited', (data) => {
        addRoomToList(data.room);
        socket.emit('room:join', { roomId: data.room._id });
    });
    
    socket.on('message:error', (data) => {
        showError(data.error);
    });
}

// Room selection
async function selectRoom(roomId) {
    // Update UI
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.room-item[data-room-id="${roomId}"]`).classList.add('active');
    
    // Hide no room selected message
    document.getElementById('noRoomSelected').style.display = 'none';
    document.getElementById('chatArea').style.display = 'flex';
    
    currentRoom = roomId;
    
    // Load room info
    const room = await loadRoomInfo(roomId);
    updateChatHeader(room);
    
    // Load messages
    await loadMessages(roomId);
    
    // Mark room as read
    await markRoomAsRead(roomId);
    
    // Join room via socket
    socket.emit('room:join', { roomId });
    
    // Focus message input
    document.getElementById('messageInput').focus();
}

// Load room info
async function loadRoomInfo(roomId) {
    const rooms = await fetchUserRooms();
    return rooms.find(r => r._id === roomId);
}

// Update chat header
function updateChatHeader(room) {
    let title = '';
    if (room.type === 'direct') {
        const otherUser = room.participants.find(p => p._id.toString() !== userId.toString());
        title = otherUser && otherUser.username ? otherUser.username : 'Unknown User';
    } else {
        title = room.name || 'Group Chat';
    }
    
    document.getElementById('chatTitle').textContent = title;
    document.getElementById('leaveRoomBtn').style.display = room.type === 'group' ? 'inline' : 'none';
}

// Load messages
async function loadMessages(roomId, before = null) {
    try {
        const response = await fetch(`/api/chat/rooms/${roomId}/messages${before ? '?before=' + before : ''}`);
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById('messagesContainer');
            if (!before) {
                container.innerHTML = '';
            }
            
            data.messages.forEach(message => {
                displayMessage(message, before ? 'prepend' : 'append');
            });
            
            if (!before) {
                scrollToBottom();
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display message
function displayMessage(message, position = 'append') {
    const container = document.getElementById('messagesContainer');
    const isOwn = message.sender._id === userId;
    
    if (message.type === 'system') {
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.textContent = message.message;
        
        if (position === 'prepend') {
            container.prepend(systemDiv);
        } else {
            container.appendChild(systemDiv);
        }
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    messageDiv.dataset.messageId = message._id;
    messageDiv.innerHTML = `
        <div class="message-avatar">
            ${message.sender.username.charAt(0).toUpperCase()}
        </div>
        <div class="message-content">
            <div class="message-bubble">
                ${escapeHtml(message.message)}
            </div>
            <div class="message-time">
                ${formatTime(message.createdAt)}
            </div>
        </div>
    `;
    
    if (position === 'prepend') {
        container.prepend(messageDiv);
    } else {
        container.appendChild(messageDiv);
        scrollToBottom();
    }
}

// Send message
function sendMessage(event) {
    event.preventDefault();
    
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || !currentRoom) return;
    
    socket.emit('message:send', {
        roomId: currentRoom,
        message: message,
        type: 'text'
    });
    
    input.value = '';
    stopTyping();
}

// Typing indicators
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing:start', { roomId: currentRoom });
    }
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1000);
}

function stopTyping() {
    if (isTyping) {
        isTyping = false;
        socket.emit('typing:stop', { roomId: currentRoom });
    }
    clearTimeout(typingTimer);
}

function showTypingIndicator(userId, username, typing) {
    const indicator = document.getElementById('typingIndicator');
    const typingUsers = JSON.parse(indicator.dataset.typingUsers || '{}');
    
    if (typing) {
        typingUsers[userId] = username;
    } else {
        delete typingUsers[userId];
    }
    
    indicator.dataset.typingUsers = JSON.stringify(typingUsers);
    
    const typingList = Object.values(typingUsers);
    if (typingList.length > 0) {
        indicator.style.display = 'block';
        indicator.querySelector('span').textContent = typingList.join(', ');
    } else {
        indicator.style.display = 'none';
    }
}

// Room management
async function createNewChat() {
    console.log('createNewChat called');
    
    if (!socket || !socket.connected) {
        console.error('Socket not connected');
        showError('Not connected to chat server. Please refresh the page.');
        return;
    }
    
    const chatType = document.querySelector('input[name="chatType"]:checked').value;
    console.log('Chat type:', chatType);
    
    if (chatType === 'direct') {
        const username = document.getElementById('directUsername').value.trim();
        if (!username) {
            showError('Please enter a username');
            return;
        }
        
        console.log('Emitting room:create for direct chat with:', username);
        socket.emit('room:create', {
            type: 'direct',
            participants: [username]
        });
    } else {
        const name = document.getElementById('groupName').value.trim();
        const participantsText = document.getElementById('groupParticipants').value;
        const participants = participantsText.split('\n').map(p => p.trim()).filter(p => p);
        
        if (!name || participants.length === 0) {
            showError('Please enter a group name and participants');
            return;
        }
        
        console.log('Emitting room:create for group chat:', name, participants);
        socket.emit('room:create', {
            type: 'group',
            name: name,
            participants: participants
        });
    }
}

function leaveRoom() {
    if (!currentRoom || !confirm('Are you sure you want to leave this room?')) return;
    
    socket.emit('room:leave', { roomId: currentRoom });
    
    // Remove room from list and select another
    const roomElement = document.querySelector(`.room-item[data-room-id="${currentRoom}"]`);
    if (roomElement) {
        roomElement.remove();
    }
    
    currentRoom = null;
    document.getElementById('noRoomSelected').style.display = 'flex';
    document.getElementById('chatArea').style.display = 'none';
}

// Status updates
function updateUserStatus(newStatus) {
    socket.emit('status:update', { status: newStatus });
}

// Room list management
async function fetchUserRooms() {
    try {
        const response = await fetch('/api/chat/rooms');
        const data = await response.json();
        return data.success ? data.rooms : [];
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return [];
    }
}

function addRoomToList(room) {
    console.log('Adding room to list:', room);
    console.log('Room participants:', room.participants);
    console.log('Current userId:', userId);
    
    const existingRoom = document.querySelector(`.room-item[data-room-id="${room._id}"]`);
    if (existingRoom) {
        updateRoomInList(room);
        return;
    }
    
    const roomList = document.getElementById('roomList');
    const roomItem = createRoomElement(room);
    roomList.prepend(roomItem);
}

function updateRoomInList(room) {
    const roomElement = document.querySelector(`.room-item[data-room-id="${room._id}"]`);
    if (!roomElement) return;
    
    // Update last message
    const lastMessageDiv = roomElement.querySelector('.room-last-message');
    if (room.lastMessage) {
        lastMessageDiv.textContent = room.lastMessage.message.substring(0, 30) + '...';
    }
}

function createRoomElement(room) {
    const div = document.createElement('div');
    div.className = `room-item ${room.isUnread ? 'unread' : ''}`;
    div.dataset.roomId = room._id;
    div.onclick = (e) => {
        e.stopPropagation();
        selectRoom(room._id);
    };
    
    let roomName, roomAvatar;
    if (room.type === 'direct') {
        const otherUser = room.participants.find(p => p._id.toString() !== userId.toString());
        roomName = otherUser && otherUser.username ? otherUser.username : 'Unknown User';
        roomAvatar = otherUser && otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';
    } else {
        roomName = room.name || 'Group Chat';
        roomAvatar = '<i class="fas fa-users"></i>';
    }
    
    div.innerHTML = `
        <div class="room-avatar">${roomAvatar}</div>
        <div class="room-info">
            <div class="room-name">${roomName}</div>
            <div class="room-last-message">
                ${room.lastMessage ? room.lastMessage.message.substring(0, 30) + '...' : 'No messages yet'}
            </div>
        </div>
        ${room.isUnread ? '<div class="unread-indicator"></div>' : ''}
    `;
    
    return div;
}

function updateRoomUnreadStatus(roomId, unread) {
    const roomElement = document.querySelector(`.room-item[data-room-id="${roomId}"]`);
    if (!roomElement) return;
    
    if (unread) {
        roomElement.classList.add('unread');
        if (!roomElement.querySelector('.unread-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'unread-indicator';
            roomElement.appendChild(indicator);
        }
    } else {
        roomElement.classList.remove('unread');
        const indicator = roomElement.querySelector('.unread-indicator');
        if (indicator) indicator.remove();
    }
}

// Mark room as read
async function markRoomAsRead(roomId) {
    try {
        await fetch(`/api/chat/rooms/${roomId}/read`, { method: 'POST' });
        updateRoomUnreadStatus(roomId, false);
        socket.emit('message:read', { roomId });
    } catch (error) {
        console.error('Error marking room as read:', error);
    }
}

// Search messages
let searchTimeout;
async function searchMessages(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        // Restore normal room list
        await refreshRoomList();
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/chat/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.success) {
                displaySearchResults(data.messages);
            }
        } catch (error) {
            console.error('Error searching messages:', error);
        }
    }, 300);
}

function displaySearchResults(messages) {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    
    if (messages.length === 0) {
        roomList.innerHTML = '<div class="no-results">No messages found</div>';
        return;
    }
    
    messages.forEach(message => {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.onclick = () => selectRoom(message.room._id);
        
        div.innerHTML = `
            <div class="search-room">${message.room.name || 'Direct Message'}</div>
            <div class="search-message">${escapeHtml(message.message)}</div>
            <div class="search-time">${formatTime(message.createdAt)}</div>
        `;
        
        roomList.appendChild(div);
    });
}

async function refreshRoomList() {
    const rooms = await fetchUserRooms();
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    
    rooms.forEach(room => {
        roomList.appendChild(createRoomElement(room));
    });
}

// Room info sidebar
function toggleRoomInfo() {
    const sidebar = document.getElementById('roomInfoSidebar');
    sidebar.classList.toggle('open');
    
    if (sidebar.classList.contains('open') && currentRoom) {
        loadRoomInfoSidebar();
    }
}

// Close room info (for mobile X button)
function closeRoomInfo() {
    const sidebar = document.getElementById('roomInfoSidebar');
    sidebar.classList.remove('open');
}

async function loadRoomInfoSidebar() {
    const room = await loadRoomInfo(currentRoom);
    const content = document.getElementById('roomInfoContent');
    
    let html = '';
    if (room.type === 'group') {
        html = `
            <h4>Participants (${room.participants.length})</h4>
            <div class="participant-list">
                ${room.participants.map(p => `
                    <div class="participant-item">
                        <div class="status-indicator status-${p.chatStatus || 'offline'}"></div>
                        <span>${p.username}</span>
                    </div>
                `).join('')}
            </div>
            <button onclick="openAddParticipantsModal()" class="btn-primary">
                Add Participants
            </button>
        `;
    } else {
        const otherUser = room.participants.find(p => p._id !== userId);
        html = `
            <h4>User Info</h4>
            <div class="user-details">
                <p><strong>Username:</strong> ${otherUser.username}</p>
                <p><strong>Status:</strong> ${otherUser.chatStatus || 'offline'}</p>
                ${otherUser.statusMessage ? `<p><strong>Message:</strong> ${otherUser.statusMessage}</p>` : ''}
            </div>
        `;
    }
    
    content.innerHTML = html;
}

// Modal functions
function openNewChatModal() {
    document.getElementById('newChatModal').style.display = 'flex';
}

function closeNewChatModal() {
    document.getElementById('newChatModal').style.display = 'none';
    document.getElementById('directUsername').value = '';
    document.getElementById('groupName').value = '';
    document.getElementById('groupParticipants').value = '';
}

function toggleChatType() {
    const chatType = document.querySelector('input[name="chatType"]:checked').value;
    document.getElementById('directChatForm').style.display = chatType === 'direct' ? 'block' : 'none';
    document.getElementById('groupChatForm').style.display = chatType === 'group' ? 'block' : 'none';
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // Less than 1 minute
        return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
        return Math.floor(diff / 60000) + 'm ago';
    } else if (diff < 86400000) { // Less than 1 day
        return Math.floor(diff / 3600000) + 'h ago';
    } else {
        return date.toLocaleDateString();
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function updateConnectionStatus(connected) {
    // Update UI to show connection status
    const statusElement = document.querySelector('.connection-status');
    if (statusElement) {
        statusElement.classList.toggle('connected', connected);
        statusElement.classList.toggle('disconnected', !connected);
    }
}

function showError(message) {
    // Simple error display
    alert(message);
}

function playNotificationSound() {
    // Optional: Play a notification sound
    // const audio = new Audio('/sounds/notification.mp3');
    // audio.play().catch(() => {});
}

// Get current user ID from session
const userId = window.currentUserId || document.querySelector('meta[name="user-id"]')?.content;

// Mobile navigation functions
function showRoomList() {
    if (window.innerWidth <= 768) {
        document.querySelector('.chat-sidebar').classList.remove('hidden');
        document.querySelector('.chat-main').classList.add('shifted');
        
        // Update mobile nav active states
        document.querySelector('.nav-rooms').classList.add('active');
        document.querySelector('.nav-chat').classList.remove('active');
    }
}

function showActiveChat() {
    if (window.innerWidth <= 768 && currentRoom) {
        document.querySelector('.chat-sidebar').classList.add('hidden');
        document.querySelector('.chat-main').classList.remove('shifted');
        
        // Update mobile nav active states
        document.querySelector('.nav-rooms').classList.remove('active');
        document.querySelector('.nav-chat').classList.add('active');
    }
}

// Update selectRoom function for mobile
const originalSelectRoom = selectRoom;
selectRoom = async function(roomId) {
    await originalSelectRoom(roomId);
    
    // On mobile, automatically switch to chat view
    if (window.innerWidth <= 768) {
        showActiveChat();
    }
};

// Handle window resize
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        if (window.innerWidth > 768) {
            // Reset mobile classes when switching to desktop
            document.querySelector('.chat-sidebar').classList.remove('hidden');
            document.querySelector('.chat-main').classList.remove('shifted');
        }
    }, 250);
});

// Initialize mobile view
if (window.innerWidth <= 768) {
    // Start with room list visible on mobile
    showRoomList();
}
