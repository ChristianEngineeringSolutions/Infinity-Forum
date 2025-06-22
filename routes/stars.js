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

module.exports = router;