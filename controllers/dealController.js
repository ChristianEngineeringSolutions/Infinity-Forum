'use strict';

const Team = require('../models/Team');
const Deal = require('../models/Deal');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts, DOCS_PER_PAGE, accessSecret} = require('../common-utils');
const passageService = require('../services/passageService');

async function makeDeal(req, res){
	await Deal.create({
		starter: req.session.user._id,
		passage: req.body.passageId
	});
}

async function deals(req, res){

}

async function deal(req, res){
	var dealId = req.body.dealId;
	var deal = await Deal.findOne({_id: dealId});
	var passage = await Passage.findOne({_id:deal.passage._id});
	var sources = passageService.getRecursiveSourceList(deal.passage.sourceList, );
}

module.exports = {
	makeDeal,
	deals,
	deal
};