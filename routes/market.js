'use strict';

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { requiresLogin } = require('../middleware/auth');

router.get('/market', marketController.market);
router.get('/market-dashboard', requiresLogin, marketController.dashboard);

module.exports = router;