/**
 * Generates a personalized feed with pagination for a user
 * Balances:
 * - Showing newer posts more frequently
 * - Occasionally showing older posts (no zero probability)
 * - Prioritizing posts with more stars
 * - Prioritizing posts used by others (especially different authors)
 * - Considering followed authors
 * 
 * @param {Object} user - The current user
 * @param {Number} page - Page number for pagination
 * @param {Number} limit - Number of items per page
 * @return {Object} Feed results with pagination info
 */
async function generateFeedWithPagination(user, page = 1, limit = 20) {
  const cacheKey = `user_feed:${user._id}`;
  const CACHE_EXPIRATION = 3600; // 1 hour in seconds
  
  // Try to get cached feed IDs
  let feedCache = await redis.get(cacheKey);
  let feedIds;
  
  // If cache doesn't exist or is expired, generate the feed scores
  if (!feedCache) {
    console.log(`Generating new feed for user ${user._id}`);
    
    // Get filtering parameters
    const recentCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // Last 90 days
    const veryRecentCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days
    
    // Get followed authors
    const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
    
    // Initial filtering query to reduce the dataset
    const passageQuery = { 
      versionOf: null,
      personal: false,
      deleted: false,
      simulated: false,
      $or: [
        { author: { $in: followedAuthors } }, // From followed authors
        { createdAt: { $gte: veryRecentCutoff } }, // Very recent content
        { "stars": { $gte: 5 } }, // Content with engagement
        { 
          createdAt: { $gte: recentCutoff },
          "stars": { $gte: 1 } // Recent with some engagement
        }
      ]
    };
    
    // Get passages with initial filtering
    // Limit to a reasonable number for scoring (1000 is enough for most feeds)
    const passages = await Passage.find(passageQuery)
      .populate('author users sourceList')
      .limit(1000);
    
    // Score and rank passages
    const scoredPassages = await scorePassages(passages, user);
    
    // Extract IDs and save to cache
    feedIds = scoredPassages.map(item => item.passage._id.toString());
    await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', CACHE_EXPIRATION);
  } else {
    // Use cached feed IDs
    feedIds = JSON.parse(feedCache);
  }
  
  // Apply pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedIds = feedIds.slice(startIndex, endIndex);
  
  // Check if we have enough items for this page
  if (paginatedIds.length < limit && startIndex < feedIds.length) {
    // We're at the last page but have fewer items than the limit
    // This is normal, just use what we have
  } else if (paginatedIds.length === 0 && feedIds.length > 0) {
    // Page is beyond available results, redirect to last valid page
    const lastValidPage = Math.ceil(feedIds.length / limit);
    return { 
      redirect: true, 
      page: lastValidPage,
      totalPages: lastValidPage
    };
  }
  
  // Fetch full passage data for paginated IDs
  let feed = [];
  if (paginatedIds.length > 0) {
    feed = await Passage.find({ 
      _id: { $in: paginatedIds.map(id => mongoose.Types.ObjectId(id)) }
    }).populate('author users sourceList');
    
    // Fill in usedIn data
    feed = await fillUsedInList(feed);
    
    // Sort according to the feed order (to maintain ranking)
    feed.sort((a, b) => {
      return paginatedIds.indexOf(a._id.toString()) - paginatedIds.indexOf(b._id.toString());
    });
  }
  
  // Return feed with pagination metadata
  return {
    feed,
    totalPages: Math.ceil(feedIds.length / limit),
    currentPage: page,
    totalItems: feedIds.length
  };
}

/**
 * Scores passages for feed ranking
 * 
 * @param {Array} passages - Array of passage objects to score
 * @param {Object} user - Current user
 * @return {Array} Scored and sorted passages
 */
async function scorePassages(passages, user) {
  // Get list of authors the user follows
  const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
  
  const scoredPassages = [];
  
  for (const passage of passages) {
    // Get distinct authors who used this passage (excluding the original author)
    const usedByAuthors = await Passage.find({
      sourceList: { $in: [passage._id] },
      versionOf: null,
      author: { $ne: passage.author._id }
    }).distinct('author');
    
    // Calculate scores for different factors
    const recencyScore = calculateRecencyScore(passage.createdAt);
    const starScore = passage.stars || 0;
    const usedByScore = usedByAuthors.length;
    
    // Apply bonuses for social factors
    const followedAuthorBonus = followedAuthors.includes(passage.author._id.toString()) ? 1.5 : 1;
    
    // Add randomness factor (values between 0.8 and 1.2)
    // This ensures some variety and prevents feeds from being too deterministic
    const randomnessFactor = 0.8 + (Math.random() * 0.4);
    
    // Calculate final score with weighted components
    const score = (
      (recencyScore * 0.4) +  // 40% weight for recency
      (starScore * 0.25) +    // 25% weight for stars
      (usedByScore * 0.25)    // 25% weight for usage by different authors
    ) * followedAuthorBonus * randomnessFactor;
    
    scoredPassages.push({
      passage,
      score
    });
  }
  
  // Sort by score (descending)
  return scoredPassages.sort((a, b) => b.score - a.score);
}

/**
 * Calculates a recency score with exponential decay
 * - New posts start with score 1.0
 * - Old posts decay to a minimum of 0.1 (never zero)
 * - This ensures older posts have some chance of appearing
 * 
 * @param {Date} createdAt - Creation date of the passage
 * @return {Number} Recency score between 0.1 and 1.0
 */
function calculateRecencyScore(createdAt) {
  const now = new Date();
  const ageInDays = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
  
  // Exponential decay function:
  // - Starts at 1.0 for new posts
  // - Decays to 0.1 for very old posts
  // - Half-life of about 14 days (0.05 decay rate)
  return 0.1 + (0.9 * Math.exp(-0.05 * ageInDays));
}

/**
 * Updates the feed in the background
 * This should be called from a cron job or similar
 */
async function scheduleBackgroundFeedUpdates() {
  try {
    // Find active users who have logged in recently
    const activeTimeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const activeUsers = await User.find({
      lastLogin: { $gte: activeTimeThreshold }
    });
    
    console.log(`Scheduling feed updates for ${activeUsers.length} active users`);
    
    // Process users in batches to avoid overwhelming the system
    const batchSize = 50;
    
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);
      
      // Process each user in the batch
      await Promise.all(batch.map(async (user) => {
        try {
          const hoursSinceLastLogin = (Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60);
          
          // Determine refresh frequency based on activity
          let refreshInterval;
          if (hoursSinceLastLogin < 24) {
            refreshInterval = 3 * 60 * 60 * 1000; // 3 hours for very active users
          } else if (hoursSinceLastLogin < 72) {
            refreshInterval = 6 * 60 * 60 * 1000; // 6 hours for moderately active users
          } else {
            refreshInterval = 12 * 60 * 60 * 1000; // 12 hours for less active users
          }
          
          // Use the job queue system to schedule feed updates
          await feedQueue.add(
            { userId: user._id.toString() },
            { 
              repeat: { every: refreshInterval },
              jobId: `feed-update-${user._id}`
            }
          );
        } catch (error) {
          console.error(`Error scheduling feed update for user ${user._id}:`, error);
        }
      }));
      
      // Small delay between batches to reduce database load
      if (i + batchSize < activeUsers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Completed scheduling feed updates`);
  } catch (error) {
    console.error('Error in scheduleBackgroundFeedUpdates:', error);
  }
}

/**
 * Process the feed generation job from the queue
 */
async function processFeedGenerationJob(job) {
  const { userId } = job.data;
  
  try {
    console.log(`Processing feed update for user ${userId}`);
    
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User ${userId} not found when processing feed update`);
      return { success: false, error: 'User not found' };
    }
    
    // Get filtered passages for this user
    const relevantPassages = await getRelevantPassagesForUser(user);
    
    // Score passages
    const scoredPassages = await scorePassages(relevantPassages, user);
    
    // Extract IDs and cache the feed
    const feedIds = scoredPassages.map(item => item.passage._id.toString());
    const cacheKey = `user_feed:${userId}`;
    
    await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600); // 1 hour cache
    
    return { 
      success: true, 
      userId,
      feedSize: feedIds.length
    };
  } catch (error) {
    console.error(`Error in processFeedGenerationJob for user ${userId}:`, error);
    return { 
      success: false, 
      userId,
      error: error.message
    };
  }
}

/**
 * Get relevant passages for a user's feed with efficient filtering
 */
async function getRelevantPassagesForUser(user, limit = 1000) {
  // Get followed authors
  const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
  
  // Time windows
  const veryRecentCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 1 week
  const recentCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // 3 months
  
  // First-stage filtering
  const query = {
    versionOf: null,
    deleted: false,
    personal: false,
    simulated: false,
    $or: [
      { author: { $in: followedAuthors } }, // From followed authors
      { createdAt: { $gte: veryRecentCutoff } }, // Very recent content
      { 
        createdAt: { $gte: recentCutoff },
        stars: { $gte: 1 } // Recent with some engagement
      }
    ]
  };
  
  // Get passages with filtered query
  const passages = await Passage.find(query)
    .populate('author users sourceList')
    .sort('-stars -createdAt')
    .limit(limit);
  
  return passages;
}

// Add this to your feed API endpoint
async function handleFeedRequest(req, res) {
  try {
    const user = req.user;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    
    // Generate or retrieve feed
    const feedResult = await generateFeedWithPagination(user, page, limit);
    
    // Check if we need to redirect to a different page
    if (feedResult.redirect) {
      return res.json({
        redirect: true,
        page: feedResult.page,
        totalPages: feedResult.totalPages
      });
    }
    
    // Return feed data
    return res.json({
      feed: feedResult.feed,
      totalPages: feedResult.totalPages,
      currentPage: feedResult.currentPage,
      totalItems: feedResult.totalItems
    });
  } catch (error) {
    console.error('Error generating feed:', error);
    return res.status(500).json({ error: 'Could not generate feed' });
  }
}

/**
 * Add this to your app setup
 */
function initFeedSystem() {
  // Set up the feed queue processor
  feedQueue.process(async (job) => {
    return await processFeedGenerationJob(job);
  });
  
  // Schedule initial background updates
  scheduleBackgroundFeedUpdates();
  
  // Schedule regular runs of the background updater
  cron.schedule('0 */6 * * *', async () => { // Every 6 hours
    await scheduleBackgroundFeedUpdates();
  });
}

// Utility function to handle real-time injection of important content
async function injectHighPriorityContent(newPassage, maxFeedsToUpdate = 100) {
  try {
    // Only inject if the passage is significant
    if (newPassage.author && (newPassage.stars > 10 || newPassage.usedByDifferentAuthorsCount > 3)) {
      console.log(`Injecting high-priority content ${newPassage._id} into user feeds`);
      
      // Find followers of this author
      const followers = await Follower.find({ following: newPassage.author._id }).limit(maxFeedsToUpdate);
      
      // Inject content into their feeds
      for (const follower of followers) {
        const cacheKey = `user_feed:${follower.user}`;
        const cachedFeed = await redis.get(cacheKey);
        
        if (cachedFeed) {
          const feedIds = JSON.parse(cachedFeed);
          
          // Insert at a high position (not necessarily the top)
          // This preserves some randomness while ensuring visibility
          const insertPosition = Math.min(5, Math.floor(feedIds.length * 0.1));
          feedIds.splice(insertPosition, 0, newPassage._id.toString());
          
          // Update cache with the new feed order
          await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600);
        }
      }
    }
  } catch (error) {
    console.error('Error injecting high priority content:', error);
  }
}

// Export functions
module.exports = {
  generateFeedWithPagination,
  scheduleBackgroundFeedUpdates,
  processFeedGenerationJob,
  getRelevantPassagesForUser,
  handleFeedRequest,
  initFeedSystem,
  injectHighPriorityContent
};