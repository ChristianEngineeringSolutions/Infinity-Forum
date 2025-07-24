'use strict';

const Visitor = require('../models/Visitor');
const { Passage } = require('../models/Passage');
const { getRedisClient, getRedisOps, isRedisReady } = require('../config/redis');

/**
 * Convert IP address to number for efficient storage and comparison
 */
function convertIpToNumber(ip) {
    if (!ip) return 0;
    return ip.split('.').map(Number).reduce((acc, val) => (acc << 8) + val, 0);
}

/**
 * Check if a view has been recorded recently to prevent duplicates
 */
async function checkRecentView(viewerId, deviceFingerprint, browserFingerprint, ipNumber, passageId, viewType) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const query = {
        visited: passageId,
        viewType: viewType,
        visitedAt: { $gte: oneDayAgo },
        $or: []
    };
    
    // Build identity conditions
    if (viewerId && viewerId !== 'null') {
        // Check both user ID and cookie ID
        if (viewerId.match(/^[0-9a-fA-F]{24}$/)) {
            // Looks like a MongoDB ObjectId (user ID)
            query.$or.push({ user: viewerId });
        } else {
            // Cookie ID
            query.$or.push({ cookieId: viewerId });
        }
    }
    
    // Check device fingerprint separately
    if (deviceFingerprint && ipNumber) {
        query.$or.push({ 
            deviceFingerprint: deviceFingerprint,
            ipNumber: ipNumber 
        });
    }
    
    // Check browser fingerprint separately (catches browser switching)
    if (browserFingerprint && ipNumber) {
        query.$or.push({ 
            browserFingerprint: browserFingerprint,
            ipNumber: ipNumber 
        });
    }
    
    // If no identification method available, reject
    if (query.$or.length === 0) return true;
    
    return await Visitor.findOne(query);
}

/**
 * Check if a video view is eligible based on rate limiting rules
 */
async function checkVideoViewEligibility(viewerId, deviceFingerprint, browserFingerprint, ipNumber, passageId, videoIndex) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Build identity query
    const identityQuery = { $or: [] };
    if (viewerId && viewerId !== 'null') {
        if (viewerId.match(/^[0-9a-fA-F]{24}$/)) {
            identityQuery.$or.push({ user: viewerId });
        } else {
            identityQuery.$or.push({ cookieId: viewerId });
        }
    }
    if (deviceFingerprint && ipNumber) {
        identityQuery.$or.push({ 
            deviceFingerprint: deviceFingerprint,
            ipNumber: ipNumber 
        });
    }
    if (browserFingerprint && ipNumber) {
        identityQuery.$or.push({ 
            browserFingerprint: browserFingerprint,
            ipNumber: ipNumber 
        });
    }
    
    if (identityQuery.$or.length === 0) return false;
    
    // Check last 30 minutes
    const recentView = await Visitor.findOne({
        visited: passageId,
        viewType: { $in: ['video_complete', 'video_partial'] },
        visitedAt: { $gte: thirtyMinAgo },
        'metadata.videoIndex': videoIndex,
        ...identityQuery
    });
    
    if (recentView) return false;
    
    // Check daily limit (3 views)
    const dailyViews = await Visitor.countDocuments({
        visited: passageId,
        viewType: { $in: ['video_complete', 'video_partial'] },
        visitedAt: { $gte: oneDayAgo },
        'metadata.videoIndex': videoIndex,
        ...identityQuery
    });
    
    return dailyViews < 3;
}

/**
 * Check if a YouTube embed view is eligible
 */
async function checkYouTubeViewEligibility(viewerId, deviceFingerprint, browserFingerprint, ipNumber, passageId, youtubeVideoId) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Build identity query
    const identityQuery = { $or: [] };
    if (viewerId && viewerId !== 'null') {
        if (viewerId.match(/^[0-9a-fA-F]{24}$/)) {
            identityQuery.$or.push({ user: viewerId });
        } else {
            identityQuery.$or.push({ cookieId: viewerId });
        }
    }
    if (deviceFingerprint && ipNumber) {
        identityQuery.$or.push({ 
            deviceFingerprint: deviceFingerprint,
            ipNumber: ipNumber 
        });
    }
    if (browserFingerprint && ipNumber) {
        identityQuery.$or.push({ 
            browserFingerprint: browserFingerprint,
            ipNumber: ipNumber 
        });
    }
    
    if (identityQuery.$or.length === 0) return false;
    
    // Check last 30 minutes
    const recentView = await Visitor.findOne({
        visited: passageId,
        viewType: 'youtube_embed',
        visitedAt: { $gte: thirtyMinAgo },
        'metadata.youtubeVideoId': youtubeVideoId,
        ...identityQuery
    });
    
    if (recentView) return false;
    
    // Check daily limit (3 views)
    const dailyViews = await Visitor.countDocuments({
        visited: passageId,
        viewType: 'youtube_embed',
        visitedAt: { $gte: oneDayAgo },
        'metadata.youtubeVideoId': youtubeVideoId,
        ...identityQuery
    });
    
    return dailyViews < 3;
}

/**
 * Cache view to prevent rapid duplicates
 */
async function cacheView(identifier, passageId, viewType) {
    if (!isRedisReady()) return;
    
    const redis = getRedisOps();
    const key = `view:${viewType}:${identifier}:${passageId}`;
    const ttl = viewType === 'page' ? 86400 : 1800; // 24 hours for pages, 30 min for videos
    
    try {
        await redis.set(key, '1', { EX: ttl });
    } catch (error) {
        console.error('Redis cache error:', error);
    }
}

/**
 * Track a page view
 */
async function trackPageView(req, passageId, timeOnPage) {
    try {
        // Require minimum 5 seconds on page
        if (!timeOnPage || timeOnPage < 5000) {
            return { success: true, counted: false, reason: 'Insufficient time on page' };
        }
        
        // Get viewer identity (prioritize: user > cookie > fingerprint)
        const viewerId = req.session?.user?._id || req.cookies?._vid || null;
        const deviceFingerprint = req.body?.deviceFingerprint;
        const browserFingerprint = req.body?.browserFingerprint;
        const ipNumber = convertIpToNumber(req.clientIp);
        
        // Check for recent view (prevent duplicates)
        const recentView = await checkRecentView(viewerId, deviceFingerprint, browserFingerprint, ipNumber, passageId, 'page');
        
        if (!recentView) {
            // Create new visitor record
            await Visitor.create({
                user: req.session?.user?._id || null,
                cookieId: req.cookies?._vid,
                sessionId: req.cookies?._vsid,
                deviceFingerprint: deviceFingerprint,
                browserFingerprint: browserFingerprint,
                fingerprint: deviceFingerprint && browserFingerprint ? 
                    require('crypto').createHash('sha256').update(deviceFingerprint + browserFingerprint).digest('hex') : null,
                ipNumber: ipNumber,
                ipAddress: req.clientIp,
                visited: passageId,
                viewType: 'page',
                duration: timeOnPage,
                visitedAt: new Date(),
                isAuthenticated: !!req.session?.user,
                userAgent: req.headers['user-agent'],
                referrer: req.headers.referrer || req.body?.referrer
            });
            
            // INCREMENT PASSAGE VIEW COUNTER
            await Passage.findByIdAndUpdate(passageId, {
                $inc: { views: 1 }
            });
            
            // Cache this view to prevent rapid duplicates
            await cacheView(viewerId || deviceFingerprint || browserFingerprint || ipNumber, passageId, 'page');
            
            return { success: true, counted: true };
        }
        
        return { success: true, counted: false, reason: 'Recent view exists' };
    } catch (error) {
        console.error('Error tracking page view:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Track a video view
 */
async function trackVideoView(req, passageId, videoIndex, watchTime, totalDuration) {
    try {
        const viewerId = req.session?.user?._id || req.cookies?._vid || null;
        const deviceFingerprint = req.body?.deviceFingerprint;
        const browserFingerprint = req.body?.browserFingerprint;
        const ipNumber = convertIpToNumber(req.clientIp);
        
        // Validate inputs
        if (isNaN(videoIndex) || videoIndex < 0) {
            return { success: false, error: 'Invalid video index' };
        }
        
        // Validate view eligibility (30 seconds or 90% watched)
        const isValidView = watchTime >= 30000 || watchTime >= (totalDuration * 0.9);
        
        if (!isValidView) {
            return { success: true, counted: false, reason: 'Insufficient watch time' };
        }
        
        // Check rate limits for video views
        const canCountView = await checkVideoViewEligibility(
            viewerId, 
            deviceFingerprint,
            browserFingerprint, 
            ipNumber, 
            passageId, 
            videoIndex
        );
        
        if (canCountView) {
            // Create visitor record
            await Visitor.create({
                user: req.session?.user?._id || null,
                cookieId: req.cookies?._vid,
                sessionId: req.cookies?._vsid,
                deviceFingerprint: deviceFingerprint,
                browserFingerprint: browserFingerprint,
                fingerprint: deviceFingerprint && browserFingerprint ? 
                    require('crypto').createHash('sha256').update(deviceFingerprint + browserFingerprint).digest('hex') : null,
                ipNumber: ipNumber,
                ipAddress: req.clientIp,
                visited: passageId,
                viewType: watchTime >= totalDuration * 0.9 ? 'video_complete' : 'video_partial',
                duration: watchTime,
                totalDuration: totalDuration,
                visitedAt: new Date(),
                isAuthenticated: !!req.session?.user,
                userAgent: req.headers['user-agent'],
                metadata: { videoIndex: videoIndex }
            });
            
            // INCREMENT VIDEO VIEW COUNTER AT SPECIFIC INDEX
            const updateQuery = {};
            updateQuery[`videoViews.${videoIndex}`] = 1;
            
            await Passage.findByIdAndUpdate(passageId, {
                $inc: updateQuery
            });
            
            // Cache this video view
            await cacheView(
                viewerId || deviceFingerprint || browserFingerprint || ipNumber, 
                `${passageId}:${videoIndex}`, 
                'video'
            );
            
            return { 
                success: true, 
                counted: true,
                viewType: watchTime >= totalDuration * 0.9 ? 'complete' : 'partial'
            };
        }
        
        return { success: true, counted: false, reason: 'Rate limit exceeded' };
    } catch (error) {
        console.error('Error tracking video view:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Track a YouTube embed view
 */
async function trackYouTubeEmbed(req, passageId, youtubeVideoId, watchTime) {
    try {
        const viewerId = req.session?.user?._id || req.cookies?._vid || null;
        const deviceFingerprint = req.body?.deviceFingerprint;
        const browserFingerprint = req.body?.browserFingerprint;
        const ipNumber = convertIpToNumber(req.clientIp);
        
        // YouTube counts at 30 seconds
        if (watchTime < 30000) {
            return { success: true, counted: false, reason: 'Insufficient watch time' };
        }
        
        // Validate YouTube video ID format
        const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
        if (!youtubeIdRegex.test(youtubeVideoId)) {
            return { success: false, error: 'Invalid YouTube video ID' };
        }
        
        // Check rate limits
        const canCountView = await checkYouTubeViewEligibility(
            viewerId,
            deviceFingerprint,
            browserFingerprint,
            ipNumber,
            passageId,
            youtubeVideoId
        );
        
        if (canCountView) {
            // Create visitor record
            await Visitor.create({
                user: req.session?.user?._id || null,
                cookieId: req.cookies?._vid,
                sessionId: req.cookies?._vsid,
                deviceFingerprint: deviceFingerprint,
                browserFingerprint: browserFingerprint,
                fingerprint: deviceFingerprint && browserFingerprint ? 
                    require('crypto').createHash('sha256').update(deviceFingerprint + browserFingerprint).digest('hex') : null,
                ipNumber: ipNumber,
                ipAddress: req.clientIp,
                visited: passageId,
                viewType: 'youtube_embed',
                duration: watchTime,
                visitedAt: new Date(),
                isAuthenticated: !!req.session?.user,
                userAgent: req.headers['user-agent'],
                metadata: { youtubeVideoId: youtubeVideoId }
            });
            
            // INCREMENT YOUTUBE VIEW COUNTER
            await Passage.findByIdAndUpdate(passageId, {
                $inc: { youtubeViews: 1 }
            });
            
            // Cache this view
            await cacheView(
                viewerId || deviceFingerprint || browserFingerprint || ipNumber, 
                `${passageId}:${youtubeVideoId}`, 
                'youtube'
            );
            
            return { success: true, counted: true };
        }
        
        return { success: true, counted: false, reason: 'Rate limit exceeded' };
    } catch (error) {
        console.error('Error tracking YouTube view:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    trackPageView,
    trackVideoView,
    trackYouTubeEmbed,
    convertIpToNumber
};