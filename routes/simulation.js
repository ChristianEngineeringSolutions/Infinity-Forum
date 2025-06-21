'use strict';

const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');
const {requiresAdmin} = require('../middleware/auth.js'); 

// Simulation routes

// Render simulation dashboard
router.get('/simulation', requiresAdmin, simulationController.renderSimulation);

// Generate simulation
router.post('/generate-simulation', requiresAdmin, simulationController.generateSimulation);

// Direct simulated passages route (not API)
router.get('/simulated-passages', simulationController.getSimulatedPassages);

module.exports = router;