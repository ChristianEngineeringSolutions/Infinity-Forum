'use strict';

const Team = require('../models/Team');
const Deal = require('../models/Deal');
const MicroDeal = require('../models/MicroDeal');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts, DOCS_PER_PAGE, accessSecret} = require('../common-utils');
const passageService = require('../services/passageService');

async function makeDeal(req, res){
	var passage = await Passage.findOne({_id: req.body.passageId});
	var sources = await passageService.getRecursiveSourceList(passage.sourceList, [], passage);
	var contributors = await passageService.getAllContributors(passage, sources);
	var deal = await Deal.create({
		starter: req.session.user._id,
		passage: req.body.passageId,
		contributors: contributors
	});
	console.log(deal);
	return res.send("Deal created.");
}

async function deals(req, res){
	var mentioned = req.query.mentioned || false;
	var find = {};
	if(mentioned){
		find.contributors = {
			$in: [req.session.user._id]
		};
	}else{
		find.starter = req.session.user._id;
	}
	var deals = await Deal.find(find).populate('passage');

	return res.render('deals', {deals: deals, mentioned: mentioned});
}

async function deal(req, res){
	var dealId = req.params.dealId;
	var dealUnpopulated = await Deal.findOne({_id: dealId});
	var deal = await Deal.findOne({_id: dealId}).populate('passage contributors');
	if(deal.starter._id.toString() !== req.session.user._id.toString()
	&& !dealUnpopulated.contributors.toString().includes(req.session.user._id.toString())){
		return res.send("Unauthorized.");
	}
	//get microdeals for each contributor
	var microDealsMap = {};
	for(const contributor of deal.contributors){
		microDealsMap[contributor._id.toString()] = [];
	}
	var microDeals = await MicroDeal.find({
		deal: deal._id
	}).populate('agrees');
	for(const microDeal of microDeals){
		if(microDeal.contributor){
			var i = 0;
			for(const agreer of microDeal.agrees){
				microDeal.agrees[i++] = agreer.name;
			}
			const contributorId = microDeal.contributor._id.toString();
			if(microDealsMap.hasOwnProperty(contributorId)){
				microDealsMap[contributorId].push(microDeal);
			}
		}
	}
	console.log('microDealsMap before filtering:', microDealsMap);
	return res.render('deal', {deal:deal, microDealsMap: microDealsMap});

}

async function sendGeneral(req, res){
	//create a microdeal for each contributor and send it to them
	var deal = await Deal.findOne({_id: req.body.deal});
	for(const contributor of deal.contributors){
		await MicroDeal.create({
			deal: deal._id,
			contributor: contributor,
			agrees: [req.session.user._id.toString()],
			contract: req.body.contract,
			paymentOption: req.body.paymentOption,
			paymentAmount: req.body.amountOrPercentage,
			paymentPercentage: req.body.amountOrPercentage,
			general: true,
			author: req.session.user._id
		});
	}
	return res.send("Done.");
}

async function sendSpecific(req, res){
	console.log("SPECIFIC");
	//create a microdeal for each contributor and send it to them
	var deal = await Deal.findOne({_id: req.body.deal});
	console.log(req.body.contributor);
	await MicroDeal.create({
		deal: deal._id,
		contributor: req.body.contributor,
		agrees: [req.session.user._id.toString()],
		contract: req.body.contract,
		paymentOption: req.body.paymentOption,
		paymentAmount: req.body.amountOrPercentage,
		paymentPercentage: req.body.amountOrPercentage,
		general: false,
		author: req.session.user._id
	});
	return res.send("Done.");
}

async function agreeToDeal(req, res){
	var dealId = req.body.dealId;
	var microDealId = req.body.microDealId;
	var microDeal = await MicroDeal.findOne({_id: microDealId});
	microDeal.agrees.push(req.session.user._id.toString());
	if(!microDeal.agrees.toString().includes(req.session.user._id.toString())){
		await MicroDeal.updateOne({
			_id: microDealId
		}, {
			$push: {agrees: req.session.user._id}
		});
		//if both parties agree to the micro deal
		if(microDeal.agrees.includes(deal.starter._id.toString()) 
		&& microDeal.agrees.includes(microDeal.contributor._id.toString())){
			//make them agree to the overall deal
			var deal = await Deal.findOne({_id: dealId});
			deal.agrees.push(deal.starter._id.toString(), microDeal.contributor._id.toString());
			if(!deal.agrees.toString().includes(req.session.user._id.toString())){
				await Deal.updateOne({
					_id: dealId
				}, {
					$push: {agrees: req.session.user._id}
				});
				if(areArraysEqualSets(deal.contributors, deal.agrees)){
					await Deal.updateOne({
						_id: dealId
					}, {
						set: {valid: true}
					});
				}
			}
		}
	}
	return res.send("Done");
}
/** 
 * https://stackoverflow.com/questions/6229197/how-to-know-if-two-arrays-have-the-same-values/55614659#55614659
 * assumes array elements are primitive types
* check whether 2 arrays are equal sets.
* @param  {} a1 is an array
* @param  {} a2 is an array
*/
function areArraysEqualSets(a1, a2) {
  const superSet = {};
  for (const i of a1) {
    const e = i + typeof i;
    superSet[e] = 1;
  }

  for (const i of a2) {
    const e = i + typeof i;
    if (!superSet[e]) {
      return false;
    }
    superSet[e] = 2;
  }

  for (let e in superSet) {
    if (superSet[e] === 1) {
      return false;
    }
  }

  return true;
}
module.exports = {
	makeDeal,
	deals,
	deal,
	sendGeneral,
	sendSpecific,
	agreeToDeal
};