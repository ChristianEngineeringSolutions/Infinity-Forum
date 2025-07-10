'use strict';

const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { createPassage } = require('../services/passageService');
// Import fake data generation functions
const fakeDataGenerator = require('../dist/js/fake.js');

// Server-side function to create fake passages directly (expects users to already be registered via HTTP)
async function createFakePassageDirectly(fakeUserData, useAIContent = true, includeImage = false, parent='root') {
    try {
        // Find the fake user in database (should already exist from HTTP registration)
        let user = await User.findOne({ username: (fakeUserData.hiddenUsername) });
        if (!user) {
            console.error(`Fake user ${fakeUserData.hiddenUsername} not found in database after HTTP registration`);
            return null;
        }
        
        // Generate passage data
        const passageData = fakeDataGenerator.generateFakePassage(user, useAIContent, includeImage);
        
        // Create passage directly in database using createPassage function
        const mockReq = {
            session: { user: user },
            body: {
                ...passageData,
                customDate: passageData.date
            }
        };
        
        // Use the existing createPassage function
        const passage = await createPassage(user, parent, false, true, passageData.date, true);
        console.log(JSON.stringify(passage));
        for (let key in passageData) {
          if (passageData.hasOwnProperty(key)) {
            passage[key] = passageData[key];
          }
        }

        if (passage && passage._id) {
            // Apply create_initial_passage logic for public/forum determination
            const labelOptions = [
                "Project", 'Idea', 'Database', "Social", "Question", 
                "Comment", "Task", "Forum", "Challenge", "Article"
            ];
            
            // Validate label
            if (!labelOptions.includes(passage.label)) {
                passage.label = "Project"; // Default fallback
            }
            
            // Set public and forum properties based on label
            switch(passage.label) {
                case 'Project':
                case 'Idea':
                case 'Database':
                case 'Article':
                    passage.public = false;
                    passage.forum = false;
                    break;
                case 'Social':
                case 'Question':
                case 'Comment':
                case 'Task':
                case 'Challenge':
                    passage.public = true;
                    passage.forum = false;
                    break;
                case 'Forum':
                    passage.public = true;
                    passage.forum = true;
                    break;
                default:
                    passage.public = false;
                    passage.forum = false;
            }
            
            // Save the updated passage with public/forum properties
            await passage.save();
            
            console.log(`Created fake passage: "${passageData.title}" by ${user.username} (${passage.label}, public: ${passage.public}, forum: ${passage.forum})`);
            return passage;
        } else {
            console.error('Failed to create fake passage');
            return null;
        }
        
    } catch (error) {
        console.error('Error creating fake passage directly:', error);
        return null;
    }
}

// Server-side function to create fake sub-passages directly
async function createFakeSubPassagesDirectly(parentPassage, users, maxSubPassages = 5, parent) {
    try {
        const numSubPassages = Math.floor(Math.random() * maxSubPassages) + 1;
        const createdSubPassages = [];
        
        for (let i = 0; i < numSubPassages; i++) {
            const randomUser = users[Math.floor(Math.random() * users.length)];
            
            // Generate sub-passage data
            const subPassageData = {
                chief: parentPassage._id.toString(),
                parent: parentPassage._id,
                title: '', // Sub-passages typically have no title
                content: fakeDataGenerator.getRandomAIPost ? 
                    fakeDataGenerator.getRandomAIPost() : 
                    require('@faker-js/faker').faker.lorem.sentences(Math.floor(Math.random() * 3) + 1),
                label: 'Comment',
                lang: 'rich',
                simulated: true,
                customDate: require('@faker-js/faker').faker.date.recent({ days: 30 }).toISOString()
            };
            
            const mockReq = {
                session: { user: randomUser },
                body: subPassageData
            };
            
            // const subPassage = await createPassage(mockReq);
            const subPassage = await createPassage(randomUser, parent, false, true, subPassageData.customDate, true);
            for (let key in subPassageData) {
              if (subPassageData.hasOwnProperty(key)) {
                subPassage[key] = subPassageData[key];
              }
            }
            
            if (subPassage && subPassage._id) {
                // Set comment and public properties based on parent label
                if (parentPassage.label === 'Challenge') {
                    subPassage.comment = false;
                    subPassage.public = false;
                } else if (parentPassage.label === 'Project') {
                    subPassage.comment = true;
                    subPassage.public = true;
                } else {
                    // Default for other parent types
                    subPassage.comment = true;
                    subPassage.public = true;
                }
                
                await subPassage.save();
                
                createdSubPassages.push(subPassage);
                console.log(`Created sub-passage for: "${parentPassage.title}" by ${randomUser.username} (comment: ${subPassage.comment}, public: ${subPassage.public})`);
            }
        }
        
        return createdSubPassages;
    } catch (error) {
        console.error('Error creating fake sub-passages directly:', error);
        return [];
    }
}

// Scoring function for simulated passages (based on generateGuestFeed algorithm)
async function scoreSimulatedPassages(passages) {
    const authorAppearances = {};
    const scoredPassages = [];

    for (const passage of passages) {
        // Calculate recency score
        const now = new Date();
        const passageDate = new Date(passage.date);
        const daysSinceCreation = (now - passageDate) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, Math.exp(-daysSinceCreation / 30)); // Decay over 30 days

        // Calculate other scores
        const starScore = Math.log10(passage.stars + 1) * 2;
        const commentScore = Math.log10((passage.comments?.length || 0) + 1) * 1.5;
        // Calculate usage score (how many times this passage is referenced)
        const usedByAuthors = await Passage.find({
            sourceList: { $in: [passage._id] },
            versionOf: null,
            author: { $ne: passage.author._id },
            simulated: false // Don't count simulated references
        }).distinct('author');
        const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;

        // Author diversity penalty
        const authorId = passage.author._id.toString();
        authorAppearances[authorId] = (authorAppearances[authorId] || 0) + 1;
        const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);

        // Add randomness
        const randomnessFactor = 0.7 + (Math.random() * 0.6);

        // Calculate final score (same weights as generateGuestFeed)
        const score = (
            (recencyScore * 0.3) +
            (starScore * 0.3) +
            (usedByScore * 0.2) +
            (commentScore * 0.2)
        ) * authorDiversityFactor * randomnessFactor;

        scoredPassages.push({
            ...passage.toObject(),
            score: score
        });
    }

    return scoredPassages;
}

module.exports = {
    createFakePassageDirectly,
    createFakeSubPassagesDirectly,
    scoreSimulatedPassages
};