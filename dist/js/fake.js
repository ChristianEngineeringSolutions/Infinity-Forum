const faker = require('faker');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Read AI-generated posts from file
function getRandomAIPost() {
    try {
        const aiPostsPath = path.join(__dirname, '../../ai-posts.txt');
        const content = fs.readFileSync(aiPostsPath, 'utf8');
        const posts = content.split('---POST---').filter(post => post.trim().length > 0);
        const randomIndex = Math.floor(Math.random() * posts.length);
        return posts[randomIndex].trim();
    } catch (error) {
        console.error('Error reading AI posts file:', error);
        return faker.lorem.paragraphs(2); // Fallback to faker lorem
    }
}

// Generate fake user data for registration
function generateFakeUserRegistration() {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const username = faker.internet.userName(firstName, lastName);
    
    return {
        username: username,
        email: faker.internet.email(firstName, lastName),
        password: 'password123',
        passwordConf: 'password123',
        name: `${firstName} ${lastName}`,
        'g-recaptcha-response': 'fake-token' // This will need bypass for testing
    };
}

// Generate fake user settings data for update
function generateFakeUserSettings(existingUser) {
    return {
        name: existingUser.name,
        about: faker.lorem.sentences(2),
        oldPassword: 'password123',
        oldUsername: existingUser.username,
        password: 'password123',
        passwordConf: 'password123',
        email: existingUser.email,
        newUsername: existingUser.username
    };
}

// Register a fake user using the register endpoint
async function registerFakeUser(domain) {
    const userData = generateFakeUserRegistration();
    
    try {
        // Note: This will fail due to reCAPTCHA validation
        // You may need to temporarily bypass reCAPTCHA for testing
        const response = await axios.post(`${domain}/register/`, userData);
        
        if (response.data && response.data._id) {
            console.log(`Created fake user: ${userData.username} (${userData.email})`);
            return response.data;
        } else {
            console.error('Failed to create fake user:', response.data);
            return null;
        }
    } catch (error) {
        console.error('Error creating fake user:', error.message);
        return null;
    }
}

// Update fake user settings using update_settings endpoint
async function updateFakeUserSettings(domain, user) {
    const settingsData = generateFakeUserSettings(user);
    
    try {
        const response = await axios.post(`${domain}/update_settings/`, settingsData);
        
        if (response.status === 200) {
            console.log(`Updated settings for fake user: ${user.username}`);
            return {
                ...user,
                about: settingsData.about,
                thumbnail: faker.image.avatar() // External faker avatar URL
            };
        } else {
            console.error('Failed to update fake user settings:', response.data);
            return user;
        }
    } catch (error) {
        console.error('Error updating fake user settings:', error.message);
        return user;
    }
}

// Generate fake passage data
function generateFakePassage(fakeUser, useAIContent = true, includeImage = false) {
    const labels = ['Project', 'Challenge']; // Only these two labels as requested
    const randomLabel = labels[Math.floor(Math.random() * labels.length)];
    
    // Generate random date in the past (up to 365 days ago)
    const randomPastDate = faker.date.past(1);
    
    const passageData = {
        chief: 'root',
        // Don't set subforums or comments values as requested
        whichPage: 'index',
        label: randomLabel,
        title: faker.company.catchPhrase(),
        content: useAIContent ? getRandomAIPost() : faker.lorem.paragraphs(3),
        tags: faker.lorem.words(3).split(' ').join(','),
        lang: 'rich',
        date: randomPastDate.toISOString(), // Send as ISO string
        simulated: 'true', // Send as string for form compatibility
        author: fakeUser._id
    };
    
    // Add image if requested
    if (includeImage) {
        passageData.filename = [faker.image.technics(800, 600)]; // External image URL
        passageData.mimeType = ['image'];
    }
    
    return passageData;
}

// Create a fake passage using the create_initial_passage endpoint
async function createFakePassage(domain, fakeUser, useAIContent = true, includeImage = false) {
    const passageData = generateFakePassage(fakeUser, useAIContent, includeImage);
    
    try {
        const response = await axios.post(`${domain}/create_initial_passage/`, passageData);
        
        if (response.data && response.data._id) {
            console.log(`Created fake passage: "${passageData.title}" by ${fakeUser.username}`);
            return response.data;
        } else {
            console.error('Failed to create fake passage:', response.data);
            return null;
        }
    } catch (error) {
        console.error('Error creating fake passage:', error.message);
        return null;
    }
}

// Create fake sub-passages/comments for a passage
async function createFakeSubPassages(domain, parentPassage, fakeUsers, maxSubPassages = 5) {
    const numSubPassages = Math.floor(Math.random() * (maxSubPassages + 1)); // 0 to maxSubPassages
    
    for (let i = 0; i < numSubPassages; i++) {
        const randomUser = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
        const isComment = Math.random() > 0.5; // 50% chance of being a comment vs sub-passage
        
        const subPassageData = {
            chief: parentPassage._id,
            // Set comments or subforums based on type
            comments: isComment ? 'true' : undefined,
            subforums: !isComment ? 'true' : undefined,
            whichPage: 'passage',
            label: isComment ? 'Comment' : 'Project',
            title: isComment ? '' : faker.hacker.phrase(),
            content: faker.lorem.sentences(Math.floor(Math.random() * 3) + 1),
            lang: 'rich',
            date: faker.date.recent(30).toISOString(), // Within last 30 days
            simulated: 'true',
            author: randomUser._id
        };
        
        try {
            await axios.post(`${domain}/create_initial_passage/`, subPassageData);
            console.log(`Created ${isComment ? 'comment' : 'sub-passage'} for "${parentPassage.title}"`);
        } catch (error) {
            console.error('Error creating sub-passage:', error.message);
        }
    }
}

// Main function to generate fake data
async function generateFakeData(domain, numUsers = 5, numPassages = 10, useAIContent = true, includeImages = false) {
    console.log(`Starting fake data generation...`);
    console.log(`Domain: ${domain}`);
    console.log(`Users: ${numUsers}, Passages: ${numPassages}`);
    console.log(`AI Content: ${useAIContent}, Include Images: ${includeImages}`);
    console.log(`WARNING: reCAPTCHA validation may cause user registration to fail`);
    
    const fakeUsers = [];
    const fakePassages = [];
    
    // Step 1: Create fake users
    console.log('\n--- Creating fake users ---');
    for (let i = 0; i < numUsers; i++) {
        const user = await registerFakeUser(domain);
        if (user) {
            // Update user settings to add bio and avatar
            const updatedUser = await updateFakeUserSettings(domain, user);
            fakeUsers.push(updatedUser);
        }
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (fakeUsers.length === 0) {
        console.error('No fake users created. Check reCAPTCHA bypass or use existing test users.');
        return;
    }
    
    // Step 2: Create fake passages
    console.log('\n--- Creating fake passages ---');
    for (let i = 0; i < numPassages; i++) {
        const randomUser = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
        const shouldIncludeImage = includeImages && Math.random() > 0.7; // 30% chance if images enabled
        
        const passage = await createFakePassage(domain, randomUser, useAIContent, shouldIncludeImage);
        if (passage) {
            fakePassages.push(passage);
        }
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Step 3: Create fake sub-passages/comments
    console.log('\n--- Creating fake sub-passages and comments ---');
    for (const passage of fakePassages) {
        await createFakeSubPassages(domain, passage, fakeUsers);
        // Small delay between each passage's sub-content
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    console.log('\n--- Fake data generation complete ---');
    console.log(`Created ${fakeUsers.length} users and ${fakePassages.length} passages`);
}

module.exports = {
    generateFakeData,
    generateFakeUserRegistration,
    generateFakeUserSettings,
    generateFakePassage,
    getRandomAIPost,
    registerFakeUser,
    updateFakeUserSettings,
    createFakePassage,
    createFakeSubPassages
};