'use strict';

const express = require('express');
const router = express.Router();
const dealController = require('../controllers/dealController');
const { requiresLogin } = require('../middleware/auth');

//bound to /teams

router.get('/', requiresLogin, dealController.deals);
router.get('/make-deal', requiresLogin, dealController.makeDeal);

module.exports = router;