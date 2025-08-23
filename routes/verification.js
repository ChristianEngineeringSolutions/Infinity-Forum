'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const verificationController = require('../controllers/verificationController');

// Rate limiter for requestVerificationCode endpoint
const requestVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many verification code requests from this IP, please try again after an hour.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => {
        // Use the X-Real-IP header, which Nginx sets with the actual client IP
        return req.headers['x-real-ip'] || req.socket.remoteAddress;
    }
});

// Rate limiter for submitVerificationCode endpoint
const submitVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // Limit each IP to 10 attempts per windowMs
  message: 'Too many verification attempts from this IP, please try again after a minute.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
        // Use the X-Real-IP header, which Nginx sets with the actual client IP
        return req.headers['x-real-ip'] || req.socket.remoteAddress;
    }
});

// Route to initiate verification
router.post('/smsverify/start', requestVerificationLimiter, verificationController.smsVerifyStart);

// Route to check the verification code
router.post('/smsverify/check', submitVerificationLimiter, verificationController.smsVerifyCheck);

// Route for creating verification session
router.post('/create-verification-session', verificationController.createVerificationSession);

// Verify identity page route
router.get('/verify-identity', verificationController.verifyIdentity);

// Verify address page route  
router.get('/verify-address', verificationController.verifyAddress);

// Verify TIN page route
router.get('/verify-tin', verificationController.verifyTIN);

// Verify email page route
router.get('/verify-email', verificationController.verifyEmail);

// Route for creating address verification session
router.post('/create-address-verification-session', verificationController.createAddressVerificationSession);

// Route for creating TIN verification session
router.post('/create-tin-verification-session', verificationController.createTINVerificationSession);

// Route for resending verification email
router.post('/resend-verification-email', verificationController.resendVerificationEmail);

module.exports = router;