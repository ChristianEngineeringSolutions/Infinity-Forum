'use strict';

const express = require('express');
const router = express.Router();
const paginationController = require('../controllers/paginationController');

// Pagination route for all content types (passages, messages, filestream, leaderboard)
router.post('/paginate', paginationController.paginate);

module.exports = router;