'use strict';

const express = require('express');
const router = express.Router();
const viewTrackingService = require('../services/viewTrackingService');
const viewTrackingMiddleware = require('../middleware/viewTracking');

// Apply view tracking middleware to all routes
router.use(viewTrackingMiddleware);

/**
 * Track a page view
 * POST /api/view/page
 */
router.post('/page', async (req, res) => {
    try {
        const { passageId, timeOnPage } = req.body;
        
        if (!passageId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Passage ID is required' 
            });
        }
        
        if (!timeOnPage || isNaN(timeOnPage)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid time on page is required' 
            });
        }
        
        const result = await viewTrackingService.trackPageView(req, passageId, timeOnPage);
        res.json(result);
    } catch (error) {
        console.error('Error in page view tracking:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * Track a video view
 * POST /api/view/video
 */
router.post('/video', async (req, res) => {
    try {
        const { passageId, videoIndex, watchTime, totalDuration } = req.body;
        
        if (!passageId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Passage ID is required' 
            });
        }
        
        if (videoIndex === undefined || isNaN(videoIndex) || videoIndex < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid video index is required' 
            });
        }
        
        if (!watchTime || isNaN(watchTime)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid watch time is required' 
            });
        }
        
        if (!totalDuration || isNaN(totalDuration)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid total duration is required' 
            });
        }
        
        const result = await viewTrackingService.trackVideoView(
            req, 
            passageId, 
            videoIndex, 
            watchTime, 
            totalDuration
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error in video view tracking:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * Track a YouTube embed view
 * POST /api/view/youtube
 */
router.post('/youtube', async (req, res) => {
    try {
        const { passageId, youtubeVideoId, watchTime } = req.body;
        
        if (!passageId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Passage ID is required' 
            });
        }
        
        if (!youtubeVideoId) {
            return res.status(400).json({ 
                success: false, 
                error: 'YouTube video ID is required' 
            });
        }
        
        if (!watchTime || isNaN(watchTime)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid watch time is required' 
            });
        }
        
        const result = await viewTrackingService.trackYouTubeEmbed(
            req, 
            passageId, 
            youtubeVideoId, 
            watchTime
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error in YouTube view tracking:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * Get view statistics for a passage (optional endpoint for debugging)
 * GET /api/view/stats/:passageId
 */
router.get('/stats/:passageId', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }
        
        const { Passage } = require('../models/Passage');
        const passage = await Passage.findById(req.params.passageId)
            .select('views videoViews youtubeViews')
            .lean();
        
        if (!passage) {
            return res.status(404).json({ 
                success: false, 
                error: 'Passage not found' 
            });
        }
        
        // Only allow author or admin to see stats
        if (passage.author.toString() !== req.session.user._id.toString() && 
            !req.session.user.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }
        
        res.json({
            success: true,
            stats: {
                pageViews: passage.views || 0,
                videoViews: passage.videoViews || [],
                youtubeViews: passage.youtubeViews || 0
            }
        });
    } catch (error) {
        console.error('Error fetching view stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

module.exports = router;