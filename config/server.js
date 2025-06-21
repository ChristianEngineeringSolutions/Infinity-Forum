'use strict';

const mongoose = require('mongoose');

// Server configuration and graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal, server, io, app) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;

  server.close(async (err) => { // Use your 'server' instance here
    console.log('Server stopped accepting new connections.');
    if (err) {
      console.error('Error during server close:', err);
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

    // Close MongoDB connection
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through graceful shutdown.');
    } catch (err) {
      console.error('Error during MongoDB shutdown:', err);
      process.exit(1);
    }
    
    // Close Socket.IO connections if you're using it
    if (io) {
      io.close(() => {
        console.log('Socket.IO server closed.');
        console.log('Graceful shutdown complete. Exiting.');
        process.exit(0);
      });
    } else {
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