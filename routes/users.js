'use strict';

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Follow route
router.post('/follow', userController.follow);

// Profile management
router.post('/change_profile_picture/', userController.changeProfilePicture);
router.post('/delete-profile', userController.deleteProfileController);

// Settings routes
router.post('/update_settings/', userController.updateSettings);

// Username utility
router.post('/get_username_number', userController.getUsernameNumber);

// Profile route
router.get("/profile/:username?/:_id?/", userController.getProfile);

// Notifications route
router.get('/notifications', userController.getNotifications);

router.get('/leaderboard', userController.leaderboard);

module.exports = router;