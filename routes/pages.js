'use strict';

const express = require('express');
const router = express.Router();
const {requiresAdmin} = require('../middleware/auth.js'); 
const pageController = require('../controllers/pageController');

router.get('/', pageController.index);
router.get('/terms', pageController.terms);
router.get('/donate', pageController.donate);
router.get('/bank', pageController.bank);
router.get('/filestream/:viewMainFile?/:directory?', pageController.fileStream);

router.get('/create-commission', pageController.createCommission);
router.get('/take-commission', pageController.takeCommission);

module.exports = router;