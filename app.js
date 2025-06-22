'use strict';

// New modular main application file
// This demonstrates how sasame.js should be restructured

require('dotenv').config();
const http = require('http');

// Import configurations
const { connectDatabase } = require('./config/database');
const { configureExpress } = require('./config/express');
const { initializeRedis } = require('./config/redis');
const { setupGracefulShutdown } = require('./config/server');

// Import route modules
const pageRoutes = require('./routes/pages');
const authRoutes = require('./routes/auth');
const verificationRoutes = require('./routes/verification');
const starRoutes = require('./routes/stars');
const bookmarkRoutes = require('./routes/bookmarks');
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

async function startServer() {
    try {
        // Initialize database connection
        await connectDatabase();
        
        // Initialize Redis (optional)
        if (process.env.REDIS_URL) {
            initializeRedis();
        }
        
        // Configure Express app
        const app = await configureExpress();
        const server = http.Server(app);
        
        // Socket.IO setup (from sasame.js line 416)
        const io = require('socket.io')(server);
        
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
        
        // Setup graceful shutdown handlers
        setupGracefulShutdown(server, io, app);
        
        // Start server (from sasame.js line 10286)
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Sasame started on Port ${PORT}`);
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