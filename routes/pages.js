'use strict';

const express = require('express');
const router = express.Router();
const {requiresAdmin} = require('../middleware/auth.js'); 
const pageController = require('../controllers/pageController');

router.get('/', pageController.index);
router.get('/terms', pageController.terms);
router.get('/leaderboard', pageController.leaderboard);
router.get('/donate', pageController.donate);
router.get('/passage/:passage_title/:passage_id/:page?', pageController.passage);
module.exports = router;