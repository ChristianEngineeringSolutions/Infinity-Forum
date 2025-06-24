'use strict';

const express = require('express');
const router = express.Router();
const daemonController = require('../controllers/daemonController');

// Daemon management routes
router.get('/get_daemons', daemonController.getDaemons);
router.post('/add_daemon', daemonController.addDaemon);
router.post('/remove_daemon', daemonController.removeDaemon);
router.post('/sort_daemons', daemonController.sortDaemons);

module.exports = router;