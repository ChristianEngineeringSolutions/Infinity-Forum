'use strict';

const express = require('express');
const router = express.Router();
const starController = require('../controllers/starController');

// Star passage route
router.post('/star_passage/', starController.starPassage);

// Single star route
router.post('/single_star/', starController.singleStarPassage);

// Borrow stars route
router.post('/borrow-stars', starController.borrowStars);

router.get('/calculate-donation-stars', starController.calculateDonationStars);

router.post('/buy-donation-stars', starController.buyDonationStarsLink);

module.exports = router;