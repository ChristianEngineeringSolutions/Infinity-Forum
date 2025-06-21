'use strict';

// Input validation middleware

function validateEmail(req, res, next) {
    if (req.body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(req.body.email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
    }
    next();
}

function validatePassword(req, res, next) {
    if (req.body.password) {
        if (req.body.password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
    }
    next();
}

function validatePhoneNumber(req, res, next) {
    if (req.body.phoneNumber) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(req.body.phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }
    }
    next();
}

function sanitizeInput(req, res, next) {
    // Basic input sanitization
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                // Remove potential script tags and other dangerous content
                req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            }
        }
    }
    next();
}

module.exports = {
    validateEmail,
    validatePassword,
    validatePhoneNumber,
    sanitizeInput
};