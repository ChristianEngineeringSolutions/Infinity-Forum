'use strict';

const express = require('express');
const router = express.Router();
const bookmarkController = require('../controllers/bookmarkController');

// Bookmark routes extracted from sasame.js

// Get bookmarks route
router.get('/get_bookmarks', bookmarkController.getBookmarks);

// Bookmark passage route
router.post('/bookmark_passage', bookmarkController.bookmarkPassage);

// Remove bookmark route
router.post('/remove_bookmark', bookmarkController.removeBookmark);

// Transfer bookmark route
router.post('/transfer_bookmark', bookmarkController.transferBookmark);

// Create passage from JSON and bookmark it
router.post('/passage_from_json', bookmarkController.passageFromJson);

module.exports = router;