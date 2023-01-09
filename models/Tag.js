'use strict';
const mongoose = require('mongoose');

const tagSchema = mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    title: String,
    passage: Passage,
    stars: Number,
    investingUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    investedStars: [Number]
});

/**
 *  How investing stars works
 *  [User1, User2, User3, ...]
 *  [123, 432, 222, 12, 33, ...]
 *  if User1 'bumbs' a passage, and has 300 stars in their reputation,
 *  he spends 1 star, with the added value of % total stars,
 *  increasing 123 to 123 + x, e.g. 130 or 124 with no star multiplier from reputation.
 *  then when User2 bumps the same tag, User1 now gets 124 stars added to their reputation
 */

/**
 * Duplicating a passage (essentially recategorizing it under a new passage)
 * adds the new parent passage title and ID as a tag
 * Accepted passages get a force multiplier for the accepter
 */


/**
 * Aside:
 * At the end of every period (x=month),
 * Users have a percentage of total stars
 * And the company account has a value
 * Users recieve x% * totalValue in usd
 * 
 * Upon donating,
 * users recieve donation/totalValue % of the total stars in stars
 * added to their reputation, + (someScalar * reputationMultiplier)
 */