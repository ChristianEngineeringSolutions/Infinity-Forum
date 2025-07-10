'use strict';

const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');
const {requiresAdmin} = require('../middleware/auth.js'); 

// Simulation routes

// Render simulation dashboard
router.get('/simulation', requiresAdmin, simulationController.renderSimulation);

// Generate simulation
router.post('/generate-simulation', 
    (req, res, next) => {
        console.log('=== Pre-admin middleware for /generate-simulation ===');
        console.log('User session:', req.session?.user?.username);
        next();
    }, 
    requiresAdmin, 
    (req, res, next) => {
        console.log('=== Post-admin middleware for /generate-simulation ===');
        console.log('About to call generateSimulation controller');
        next();
    },
    simulationController.generateSimulation
);

// Direct simulated passages route (not API)
router.get('/simulated-passages', simulationController.getSimulatedPassages);

module.exports = router;