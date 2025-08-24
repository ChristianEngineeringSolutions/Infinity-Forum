'use strict';

const Team = require('../models/Team');
const Deal = require('../models/Deal');
const MicroDeal = require('../models/MicroDeal');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts, DOCS_PER_PAGE, accessSecret} = require('../common-utils');
const passageService = require('../services/passageService');

async function makeDeal(req, res){
	console.log("test");
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
	var deal = await Deal.findOne({_id: dealId}).populate('passage contributors');
	//get microdeals for each contributor
	var microDealsMap = {};
	for(const contributor of deal.contributors){
		microDealsMap[contributor._id.toString()] = [];
	}
	var microDeals = await MicroDeal.find({
		deal: deal._id
	});
	for(const microDeal of microDeals){
		if(microDeal.contributor){
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

module.exports = {
	makeDeal,
	deals,
	deal,
	sendGeneral,
	sendSpecific
};