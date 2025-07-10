'use strict';

const rateLimit = require('express-rate-limit');

// Authentication middleware functions

const requiresLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).send("<h2 style='text-align:center;color:red;'>You must be logged in.</h2>");
  }
  next();
};

const requiresAdmin = (req, res, next) => {
  console.log('=== requiresAdmin middleware ===');
  console.log('Session user:', req.session.user ? req.session.user.username : 'No user');
  console.log('Is admin:', req.session.user ? req.session.user.admin : 'N/A');
  
  if (!req.session.user || !req.session.user.admin) {
    console.log('Access denied - not admin');
    return res.status(403).send("<h2 style='text-align:center;color:red;'>Admin access required.</h2>");
  }
  console.log('Access granted - user is admin');
  next();
};

const isAdminLoggedIn = (req, res, next) => {
  if (req.session.user && req.session.user.admin === true) {
    req.isAdmin = true; // Set a flag for the next middleware
    return next();
  }
  req.isAdmin = false;
  next();
};

const enforceUnderConstruction = (req, res, next) => {
  const allowedPaths = [
    '/loginform',
    '/jquery-ui.min.js',
    '/jquery-ui.css',
    '/jquery.modal.min.js',
    '/jquery.modal.js',
    '/jquery.modal.min.css',
    '/data.json',
    '/ionicons.esm.js',
    '/ionicons.js',
    '/p-9c97a69a.js',
    '/p-c1aa32dd.entry.js',
    '/p-85f22907.js',
    '/quill.snow.css',
    '/quill.min.js',
    '/highlight.css',
    '/highlight.js',
    '/jquery.min.js'
  ];

  if (!req.isAdmin && !allowedPaths.includes(req.path)) {
    return res.render('construction');
  }
  next();
};

function updateActivityTimestamp(req, res, next) {
    if (req.session.user) {
        req.session.user.lastActivity = new Date();
    }
    next();
}

// Rate limiting configurations
const requestVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many verification code requests from this IP, please try again after an hour.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const submitVerificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // Limit each IP to 10 attempts per windowMs
  message: 'Too many verification attempts from this IP, please try again after a minute.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  requiresLogin,
  requiresAdmin,
  isAdminLoggedIn,
  enforceUnderConstruction,
  updateActivityTimestamp,
  requestVerificationLimiter,
  submitVerificationLimiter
};