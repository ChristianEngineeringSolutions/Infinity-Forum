'use strict';

const express = require('express');
const router = express.Router();
const {requiresAdmin} = require('../middleware/auth.js'); 
const pageController = require('../controllers/pageController');

router.get('/', pageController.index);
module.exports = router;