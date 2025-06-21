'use strict';

const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// Search routes extracted from sasame.js

// Main search route
router.post('/search/', searchController.search);

// Passage search route
router.post('/search_passage/', searchController.searchPassage);

// Profile search route
router.post('/search_profile/', searchController.searchProfile);

// Messages search route
router.post('/search_messages/', searchController.searchMessages);

// Leaderboard search route
router.post('/search_leaderboard/', searchController.searchLeaderboard);

// PPE search route
router.post('/ppe_search/', searchController.ppeSearch);

module.exports = router;