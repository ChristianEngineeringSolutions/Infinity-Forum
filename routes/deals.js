'use strict';

const express = require('express');
const router = express.Router();
const dealController = require('../controllers/dealController');
const { requiresLogin } = require('../middleware/auth');

//bound to /teams

router.get('/', requiresLogin, dealController.deals);
router.get('/deal/:dealId', requiresLogin, dealController.deal);
router.post('/make-deal', requiresLogin, dealController.makeDeal);
router.post('/send-general', requiresLogin, dealController.sendGeneral);
router.post('/send-specific', requiresLogin, dealController.sendSpecific);

module.exports = router;