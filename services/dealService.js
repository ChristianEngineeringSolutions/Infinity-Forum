const { Passage } = require('../models/Passage');
const Deal = require('../models/Deal');
const { User } = require('../models/User');
const { scripts } = require('../common-utils');
const passageService = require('./passageService');

async function invalidateOldDeals(parent){
	try {
		// Step 1: Find all passages that are affected (recursively find all passages that use parent)
		const affectedPassages = await findAllAffectedPassages(parent._id);
		
		if (affectedPassages.length === 0) {
			return; // No passages affected, nothing to do
		}
		
		// Step 2: Get all deals for affected passages
		const deals = await Deal.find({
			passage: { $in: affectedPassages }
		}).populate({
			path: 'passage',
			populate: {
				path: 'author collaborators sourceList',
				populate: {
					path: 'author collaborators'
				}
			}
		}).populate('contributors');
		
		if (deals.length === 0) {
			return; // No deals to process
		}
		
		// Step 3: Process each deal
		const dealsToUpdate = [];
		
		for (const deal of deals) {
			// Get current contributors for this deal's passage
			const sources = await passageService.getRecursiveSourceList(
				deal.passage.sourceList || [], 
				[], 
				deal.passage, 
				true
			);
			const currentContributors = passageService.getAllContributors(deal.passage, sources);
			
			// Compare contributor counts
			const originalCount = deal.contributors ? deal.contributors.length : 0;
			const currentCount = currentContributors.length;
			
			// Prepare update object
			const updateData = {
				contributors: currentContributors // Always update to current state
			};
			
			// Only invalidate if contributor count increased
			if (currentCount > originalCount) {
				updateData.valid = false;
			}
			
			dealsToUpdate.push({
				dealId: deal._id,
				updateData
			});
		}
		
		// Step 4: Batch update all deals
		const bulkOps = dealsToUpdate.map(({ dealId, updateData }) => ({
			updateOne: {
				filter: { _id: dealId },
				update: updateData
			}
		}));
		
		if (bulkOps.length > 0) {
			await Deal.bulkWrite(bulkOps);
		}
		
	} catch (error) {
		console.error('Error in invalidateOldDeals:', error);
		throw error;
	}
}

// Helper function to recursively find all passages affected by changes to a parent passage
async function findAllAffectedPassages(parentId, visited = new Set()) {
	const affectedPassages = [];
	
	// Prevent infinite loops
	if (visited.has(parentId.toString())) {
		return affectedPassages;
	}
	visited.add(parentId.toString());
	
	// Find all passages that directly use this parent as a source
	const directlyAffected = await Passage.find({
		sourceList: { $in: [parentId] },
		versionOf: null // Don't include versions
	}).select('_id sourceList');
	
	// Add directly affected passages to result
	for (const passage of directlyAffected) {
		affectedPassages.push(passage._id);
		
		// Recursively find passages that use these affected passages
		const indirectlyAffected = await findAllAffectedPassages(passage._id, visited);
		affectedPassages.push(...indirectlyAffected);
	}
	
	return affectedPassages;
}

module.exports = {
	invalidateOldDeals
};