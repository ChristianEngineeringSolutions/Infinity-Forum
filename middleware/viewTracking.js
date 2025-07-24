'use strict';

const crypto = require('crypto');

/**
 * Middleware to manage view tracking cookies
 * Sets up persistent viewer ID and session ID cookies
 */
function viewTrackingMiddleware(req, res, next) {
    // Generate viewer ID if not present (persistent cookie - 2 years)
    if (!req.cookies._vid) {
        const viewerId = crypto.randomBytes(16).toString('hex');
        res.cookie('_vid', viewerId, {
            maxAge: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        req.cookies._vid = viewerId; // Make it available in current request
    }
    
    // Generate session ID if not present (session cookie)
    if (!req.cookies._vsid) {
        const sessionId = crypto.randomBytes(16).toString('hex');
        res.cookie('_vsid', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
            // No maxAge = session cookie
        });
        req.cookies._vsid = sessionId; // Make it available in current request
    }
    
    // Extract client IP address
    req.clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   req.connection.socket?.remoteAddress ||
                   '0.0.0.0';
    
    // Convert IPv6 localhost to IPv4
    if (req.clientIp === '::1') {
        req.clientIp = '127.0.0.1';
    }
    
    // Remove IPv6 prefix if present
    if (req.clientIp.substr(0, 7) === '::ffff:') {
        req.clientIp = req.clientIp.substr(7);
    }
    
    next();
}

module.exports = viewTrackingMiddleware;