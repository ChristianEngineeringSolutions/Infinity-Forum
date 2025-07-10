'use strict';

const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');
// Will need api controller
// const apiController = require('../controllers/apiController');

// API routes

// Simulated passages API
router.post('/api/simulated-passages', simulationController.getSimulatedPassagesAPI);

// Engagement tracking API
router.post('/api/track-engagement', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Track engagement API placeholder' });
});

// Generate simulation API - moved to simulation.js

// Test route
router.post('/test/', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'Test API placeholder' });
});

// CES Connect route
router.post('/cesconnect', async (req, res) => {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.json({ message: 'CES Connect placeholder' });
});

module.exports = router;