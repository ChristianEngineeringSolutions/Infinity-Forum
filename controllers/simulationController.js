'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const { createFakePassageDirectly, createFakeSubPassagesDirectly, scoreSimulatedPassages } = require('../services/simulationService');
const passageService = require('../services/passageService');
const browser = require('browser-detect');

async function renderSimulation(req, res) {
    try {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        res.render('simulation', {
            ISMOBILE: ISMOBILE,
            user: req.session.user,
            page: 'simulation',
            passageTitle: 'Simulation Management'
        });
    } catch (error) {
        console.error('Error loading simulation page:', error);
        res.status(500).send('Error loading simulation page');
    }
}

async function generateSimulation(req, res) {
    console.log('=== generateSimulation called ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    
    try {
        const { numUsers, numPassages, contentType, includeImages, includeSubContent } = req.body;
        const domain = process.env.DOMAIN || 'http://localhost:3000';
        
        // Import the fake data generator
        const fakeGenerator = require('../dist/js/fake.js');
        
        // Validate input
        if (!numUsers || !numPassages || numUsers < 1 || numPassages < 1) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        
        if (numUsers > 50 || numPassages > 100) {
            return res.status(400).json({ error: 'Too many users or passages requested' });
        }
        
        console.log(`Admin ${req.session.user.username} requested simulation generation:`);
        console.log(`Users: ${numUsers}, Passages: ${numPassages}, Content: ${contentType}`);
        
        // Generate the fake data using HTTP registration for users and direct database creation for passages
        const useAIContent = contentType === 'ai';
        const includeImagesFlag = includeImages === true;
        const totalUsers = parseInt(numUsers);
        const totalPassages = parseInt(numPassages);
        
        console.log('Registering fake users via HTTP and creating passages directly in database...');
        
        // Generate fake users first using HTTP registration
        const createdUsers = [];
        for (let i = 0; i < totalUsers; i++) {
            console.log(`Registering fake user ${i + 1}/${totalUsers}...`);
            const fakeUserData = await fakeGenerator.registerFakeUser(domain);
            if (fakeUserData) {
                createdUsers.push(fakeUserData);
            } else {
                console.warn(`Failed to register fake user ${i + 1}, skipping...`);
            }
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        if (createdUsers.length === 0) {
            return res.status(500).json({ 
                error: 'Failed to create any fake users via HTTP registration',
                details: 'Check reCAPTCHA bypass or registration endpoint'
            });
        }
        
        console.log(`Successfully registered ${createdUsers.length} fake users via HTTP`);
        
        // Create passages for each user
        let createdPassagesCount = 0;
        const createdPassages = [];
        const passagesPerUser = Math.ceil(totalPassages / totalUsers);
        
        for (const userData of createdUsers) {
            for (let j = 0; j < passagesPerUser && createdPassagesCount < totalPassages; j++) {
                const passage = await createFakePassageDirectly(userData, useAIContent, includeImagesFlag);
                if (passage) {
                    createdPassagesCount++;
                    createdPassages.push(passage);
                }
            }
        }
        
        // Create sub-passages if includeSubContent is true
        let totalSubPassagesCreated = 0;
        if (includeSubContent === true && createdPassages.length > 0) {
            console.log('Creating sub-passages for main passages...');
            
            for (const passage of createdPassages) {
                const subPassages = await createFakeSubPassagesDirectly(passage, createdUsers, passage._id);
                totalSubPassagesCreated += subPassages.length;
            }
            
            console.log(`Created ${totalSubPassagesCreated} sub-passages`);
        }
        
        console.log(`Completed: Registered ${createdUsers.length} users via HTTP, created ${createdPassagesCount} passages, and ${totalSubPassagesCreated} sub-passages`);
        
        res.json({
            success: true,
            usersCreated: createdUsers.length,
            passagesCreated: createdPassagesCount,
            subPassagesCreated: totalSubPassagesCreated,
            message: 'Simulation data generated successfully using HTTP registration for users and direct database creation for passages'
        });
        
    } catch (error) {
        console.error('Error generating simulation data:', error);
        res.status(500).json({ 
            error: 'Failed to generate simulation data',
            details: error.message 
        });
    }
}

async function getSimulatedPassages(req, res) {
    try {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        const { page = 1, sortBy = 'score', label = '', limit = 10 } = req.body;
        const skip = (page - 1) * limit;

        // Base query for simulated passages
        let query = {
            simulated: true,
            deleted: false,
            versionOf: null
        };

        // Add label filter if specified
        if (label && label !== '') {
            query.label = label;
        }

        // Get passages for scoring
        const passages = await Passage.find(query)
            .populate('author users sourceList')
            .limit(1000); // Get more for scoring, then paginate

        if (passages.length === 0) {
            return res.json({ passages: [], hasMore: false });
        }

        // Apply scoring algorithm (same as generateGuestFeed)
        const scoredPassages = await scoreSimulatedPassages(passages);

        // Sort based on sortBy parameter
        let sortedPassages;
        switch (sortBy) {
            case 'stars':
                sortedPassages = scoredPassages.sort((a, b) => b.stars - a.stars);
                break;
            case 'recent':
                sortedPassages = scoredPassages.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'comments':
                sortedPassages = scoredPassages.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
                break;
            case 'score':
            default:
                sortedPassages = scoredPassages.sort((a, b) => b.score - a.score);
                break;
        }

        // Paginate results
        const paginatedPassages = sortedPassages.slice(skip, skip + limit);
        const hasMore = skip + limit < sortedPassages.length;

        // Process passages for display
        const processedPassages = [];
        for (const passage of paginatedPassages) {
            const processedPassage = await passageService.getPassage(passage);
            console.log(processedPassage.starrers);
            console.log(passage.stars)
            processedPassages.push(processedPassage);
        }

        const scripts = {}; // This should be imported from common-utils or made available
        
        return res.render("stream", {
          subPassages: false,
          passageTitle: false, 
          scripts: scripts, 
          passages: processedPassages, 
          passage: {
            id: 'root', 
            author: {
              _id: 'root',
              username: 'Sasame'
            }
          },
          ISMOBILE: ISMOBILE,
          page: 'posts',
          whichPage: 'simulation',
          thread: false,
        });
    } catch (error) {
        console.error('Error loading simulated passages page:', error);
        res.status(500).send('Error loading simulated passages page');
    }
}

async function getSimulatedPassagesAPI(req, res) {
    try {
        const { page = 1, sortBy = 'score', label = '', limit = 10 } = req.body;
        const skip = (page - 1) * limit;

        // Base query for simulated passages
        let query = {
            simulated: true,
            deleted: false,
            versionOf: null
        };

        // Add label filter if specified
        if (label && label !== '') {
            query.label = label;
        }

        // Get passages for scoring
        const passages = await Passage.find(query)
            .populate('author users sourceList')
            .limit(1000); // Get more for scoring, then paginate

        if (passages.length === 0) {
            return res.json({ passages: [], hasMore: false });
        }

        // Apply scoring algorithm (same as generateGuestFeed)
        const scoredPassages = await scoreSimulatedPassages(passages);

        // Sort based on sortBy parameter
        let sortedPassages;
        switch (sortBy) {
            case 'stars':
                sortedPassages = scoredPassages.sort((a, b) => b.stars - a.stars);
                break;
            case 'recent':
                sortedPassages = scoredPassages.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'comments':
                sortedPassages = scoredPassages.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
                break;
            case 'score':
            default:
                sortedPassages = scoredPassages.sort((a, b) => b.score - a.score);
                break;
        }

        // Paginate results
        const paginatedPassages = sortedPassages.slice(skip, skip + limit);
        const hasMore = skip + limit < sortedPassages.length;

        // Process passages for display
        const processedPassages = [];
        for (const passage of paginatedPassages) {
            const processedPassage = await passageService.getPassage(passage);
            processedPassages.push(processedPassage);
        }

        res.json({
            passages: processedPassages,
            hasMore: hasMore,
            total: sortedPassages.length
        });
        
    } catch (error) {
        console.error('Error loading simulated passages API:', error);
        res.status(500).json({ 
            error: 'Failed to load simulated passages',
            details: error.message 
        });
    }
}

module.exports = {
    renderSimulation,
    generateSimulation,
    getSimulatedPassages,
    getSimulatedPassagesAPI,
    // Export the service functions for direct use if needed
    createFakePassageDirectly,
    createFakeSubPassagesDirectly,
    scoreSimulatedPassages
};