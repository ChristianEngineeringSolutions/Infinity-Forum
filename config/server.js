'use strict';

const mongoose = require('mongoose');
const { getRedisClient, getFeedQueue, getStarQueue } = require('./redis');

// Server configuration and graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal, server, io, app) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  // Force exit after 30 seconds
  const forceExitTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 30000);

  // First, close Socket.IO to disconnect all clients immediately
  if (io) {
    try {
      // Disconnect all sockets first
      const sockets = await io.fetchSockets();
      console.log(`Disconnecting ${sockets.length} main socket connections...`);
      for (const socket of sockets) {
        socket.disconnect(true);
      }
      
      // Disconnect chat namespace sockets
      const chatNamespace = io.of('/chat');
      const chatSockets = await chatNamespace.fetchSockets();
      console.log(`Disconnecting ${chatSockets.length} chat socket connections...`);
      for (const socket of chatSockets) {
        socket.disconnect(true);
      }
      
      // Remove listeners and close engine
      chatNamespace.removeAllListeners();
      io.removeAllListeners();
      io.engine.close();
    } catch (err) {
      console.error('Error disconnecting sockets:', err);
    }
  }

  // Now close the HTTP server
  server.close(async (err) => {
    console.log('Server stopped accepting new connections.');
    if (err) {
      console.error('Error during server close:', err);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }

    const shutdownTimeout = 10000; // 10 seconds
    const startTime = Date.now();

    // You might need a different way to track in-flight requests
    // if you're not solely relying on Express's internal mechanisms.
    // This example assumes Express is handling requests.
    while (Date.now() - startTime < shutdownTimeout && app._events.requestCount > 0) {
      console.log(`Waiting for ${app._events.requestCount} requests to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }

    console.log('All in-flight requests finished (or timeout reached).');

    // Close Bull queues
    try {
      const feedQueue = getFeedQueue();
      const starQueue = getStarQueue();
      
      if (feedQueue) {
        await feedQueue.close();
        console.log('Feed queue closed.');
      }
      
      if (starQueue) {
        await starQueue.close();
        console.log('Star queue closed.');
      }
    } catch (err) {
      console.error('Error closing Bull queues:', err);
    }

    // Close Redis connection
    try {
      const redisClient = getRedisClient();
      if (redisClient && redisClient.connected) {
        await new Promise((resolve) => {
          redisClient.quit(() => {
            console.log('Redis connection closed.');
            resolve();
          });
        });
      }
    } catch (err) {
      console.error('Error closing Redis:', err);
    }

    // Close MongoDB connection
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through graceful shutdown.');
    } catch (err) {
      console.error('Error during MongoDB shutdown:', err);
      process.exit(1);
    }
    
    // Final Socket.IO cleanup
    if (io) {
      // Set a timeout for Socket.IO close
      const closeTimeout = setTimeout(() => {
        console.log('Socket.IO close timeout - forcing exit');
        clearTimeout(forceExitTimeout);
        process.exit(0);
      }, 5000);
      
      io.close(() => {
        clearTimeout(closeTimeout);
        clearTimeout(forceExitTimeout);
        console.log('Socket.IO server closed.');
        console.log('Graceful shutdown complete. Exiting.');
        process.exit(0);
      });
    } else {
      clearTimeout(forceExitTimeout);
      console.log('Graceful shutdown complete. Exiting.');
      process.exit(0);
    }
  });
}

function setupGracefulShutdown(server, io, app) {
  // Listen for SIGINT (Ctrl+C) - from line 10296
  process.on('SIGINT', (signal) => gracefulShutdown(signal, server, io, app));

  // Listen for SIGTERM (PM2 shutdown) - from line 10299
  process.on('SIGTERM', (signal) => gracefulShutdown(signal, server, io, app));
}

function getShutdownStatus() {
  return isShuttingDown;
}

module.exports = {
  gracefulShutdown,
  setupGracefulShutdown,
  getShutdownStatus
};