'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Authentication routes extracted from sasame.js

// Login routes
router.get('/loginform', authController.renderLoginForm);
router.post('/login', authController.handleLogin);

// Registration route
router.post('/register/', authController.handleRegister);

// Logout route
router.get('/logout', authController.handleLogout);

// Password recovery routes
router.get('/recover', authController.renderRecover);
router.post('/recover', authController.handleRecover);
router.get('/recoverpassword/:user_id/:token', authController.renderRecoverPassword);
router.post('/recover_password', authController.handleRecoverPassword);

// Email verification route
router.get('/verify/:user_id/:token', authController.handleEmailVerification);

// Identity verification route (Stripe)
router.get('/verify-identity', authController.renderVerifyIdentity);

module.exports = router;