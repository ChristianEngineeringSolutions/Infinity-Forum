const express = require('express');
const router = express.Router();
const passageController = require('../controllers/passageController');

// Import dependencies for passage routes
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { Notification } = require('../models/Notification');
const { scripts, sortArray } = require('../common-utils');
const browser = require('browser-detect');
const rateLimit = require('express-rate-limit');
const DOCS_PER_PAGE = 10;

// Import from other controllers
const { getRemotePage } = require('../controllers/systemController');
const { createBookmark } = require('../controllers/bookmarkController');
const { uploadFile, updateFile, getDirectoryStructure, decodeDirectoryStructure } = require('../services/fileService');

// Rate limiter for create initial passage endpoint
const intialPassageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // Limit each IP to 20 requests per windowMs
  message: 'Too many passages created, please try again after a minute.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Main passage display routes - from sasame.js

router.get('/posts', passageController.postsPage);

router.get('/forum', passageController.forumPage);

router.get('/personal/:user_id', passageController.personalPage);

router.get('/feed', passageController.feedPage);

// GET routes for passage display

// Get passage route - from sasame.js line 1853
router.get('/get_passage', passageController.getPassage);

// Passage form route - from sasame.js line 6402
router.get('/passage_form/', passageController.passageForm);

// Create routes

// Create passage route - from sasame.js line 6496
router.post('/create_passage/', passageController.createPassage);

// Create initial passage route - from sasame.js line 6515 (truncated for length but with proper imports)
router.post('/create_initial_passage/', intialPassageLimiter, passageController.createInitialPassage);

// Update routes

router.post(/\/delete_passage\/?/, passageController.deletePassage);

// Update passage order route - from sasame.js line 7039
router.post('/update_passage_order/', passageController.updatePassageOrder);

// Update passage route - from sasame.js line 7263 (truncated but with proper imports)
router.post('/update_passage/', passageController.updatePassage);

// Copy and share routes

// Share passage route - from sasame.js line 1345
router.post('/share_passage', passageController.sharePassage);

// Copy passage route (currently commented out in sasame.js)
router.post('/copy_passage/', passageController.copyPassage);

// Settings and collaboration

// Passage setting route - from sasame.js line 3592
router.post('/passage_setting', passageController.setPassageSetting);

// Add collaborator route - from sasame.js line 3563
router.post('/add_collaborator', passageController.addCollaborator);

// Remove collaborator route - from sasame.js line 3716
router.post('/remove_collaber', passageController.removeCollaber);

router.post('/install_passage', passageController.installPassage);

// Passage from JSON route - from sasame.js line 1863
router.post('/passage_from_json', passageController.passageFromJSON);

module.exports = router;