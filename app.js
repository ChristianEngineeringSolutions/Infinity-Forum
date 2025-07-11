'use strict';

// New modular main application file
// This demonstrates how sasame.js should be restructured

require('dotenv').config();
const http = require('http');

// Import configurations
const { connectDatabase } = require('./config/database');
const { configureExpress } = require('./config/express');
const { initializeRedis, getFeedQueue } = require('./config/redis');
const { setupGracefulShutdown } = require('./config/server');

// Import route modules
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const verificationRoutes = require('./routes/verification');
const starRoutes = require('./routes/stars');
const bookmarkRoutes = require('./routes/bookmarks');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const searchRoutes = require('./routes/search');
const paginationRoutes = require('./routes/pagination');
const adminRoutes = require('./routes/admin');
const moderatorRoutes = require('./routes/moderator');
const apiRoutes = require('./routes/api');
const stripeRoutes = require('./routes/stripe');
const staticRoutes = require('./routes/static');
const passageRoutes = require('./routes/passage');
const simulationRoutes = require('./routes/simulation');
const chatRoutes = require('./routes/chat');

const passageService = require('./services/passageService');
const { initializeChatSocket } = require('./config/chatSocket');

async function startServer() {
    try {
        // Initialize database connection
        await connectDatabase();
        
        const redisInitialized = await initializeRedis();
        console.log('Redis initialization result:', redisInitialized);
        
        // Configure Express app
        const app = await configureExpress();
        const server = http.Server(app);
        
        // Socket.IO setup (from sasame.js line 416)
        const io = require('socket.io')(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        
        // Add session middleware to Socket.IO
        const sessionMiddleware = require('express-session');
        const sharedsession = require('express-socket.io-session');
        const sessionShareMiddleware = sharedsession(app.get('session'), {
            autoSave: true
        });
        
        io.use(sessionShareMiddleware);
        
        // Initialize chat socket handlers and pass session middleware
        initializeChatSocket(io, sessionShareMiddleware);
        
        // Middleware to track in-flight requests (from sasame.js line 10302)
        app.use((req, res, next) => {
          if (!require('./config/server').getShutdownStatus()) {
            app._events.requestCount = (app._events.requestCount || 0) + 1;
            res.on('finish', () => {
              app._events.requestCount = Math.max(0, (app._events.requestCount || 1) - 1);
            });
          }
          next();
        });
        
        // Mount route modules
        app.use('/', pageRoutes);
        app.use('/', authRoutes);
        app.use('/', verificationRoutes);
        app.use('/', starRoutes);
        app.use('/', bookmarkRoutes);
        app.use('/', messageRoutes);
        app.use('/', userRoutes);
        app.use('/', searchRoutes);
        app.use('/', paginationRoutes);
        app.use('/', adminRoutes);
        app.use('/', moderatorRoutes);
        app.use('/', apiRoutes);
        app.use('/', stripeRoutes);
        app.use('/', staticRoutes);
        app.use('/', passageRoutes);
        app.use('/', simulationRoutes);
        app.use('/', chatRoutes);
        
        // Setup graceful shutdown handlers
        setupGracefulShutdown(server, io, app);
        
        // Start server (from sasame.js line 10286)
        const PORT = process.env.PORT || 3000;
        
        //cron jobs
        const rewardUsers = require('./cron/rewardUsers');
        const feedUpdates = require('./cron/feedUpdates');

        //feed updates
        var feedQueue = getFeedQueue();
        // Process feed generation jobs
        feedQueue.process(async (job) => {
          return await passageService.processFeedGenerationJob(job);
        });
        // Schedule initial feed updates for active users
        const startupDelay = 10 * 1000; // 10 seconds
        setTimeout(async () => {
          try {
            await passageService.scheduleBackgroundFeedUpdates();
            console.log('Initial feed updates scheduled');
          } catch (error) {
            console.error('Error scheduling initial feed updates:', error);
          }
        }, startupDelay);
        
        console.log('Feed system initialized');
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Sasame started on Port ${PORT}`);
            rewardUsers.start();
            feedUpdates.start();
            io.sockets.emit("serverRestart", "Test");
        });
        
    } catch (error) {
        console.error('✗ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
startServer();

module.exports = { startServer };