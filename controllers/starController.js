'use strict';

const mongoose = require('mongoose');
const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const Star = require('../models/Star');
const System = require('../models/System');
const Message = require('../models/Message');
const starService = require('../services/starService');
const starQueue = require('../services/starServiceQueued');
const passageService = require('../services/passageService');
const {monthsBetween, percentUSD} = require('../common-utils');
const { getRecursiveSourceList, fillUsedInListSingle, getLastSource } = require('./passageController');
const { passageSimilarity, overlaps } = require('../utils/stringUtils');

async function starPassage(req, res){
    var passage_id = req.body.passage_id;
    var user = req.session.user;
    var amount = Number(req.body.amount);
    //get user from db
    let sessionUser = await User.findOne({_id: user._id});
    var subPassage = req.body.parent == 'root' ? false : true;
    if(req.session.user && user){
        if((sessionUser.stars + sessionUser.borrowedStars + sessionUser.donationStars) >= amount && process.env.REMOTE == 'true'){
            let passage = await starQueue.starPassage(req.session.user, amount, req.body.passage_id, sessionUser._id, true);
            if(typeof passage === 'object' && passage !== null){
                // passage = await passageService.getPassage(passage);
            }
            else{
                return res.send(passage);
            }
            // passage.location = await passageService.returnPassageLocation(passage);
            return res.send("Done.");
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else if(process.env.REMOTE == 'false'){
            let passage = await starQueue.starPassage(req.session.user, amount, req.body.passage_id, sessionUser._id, true);
            await sessionUser.save();
            if(typeof passage === 'object' && passage !== null){
                // passage = await passageService.getPassage(passage);
            }
            else{
                return res.send(passage);
            }
            // passage.location = await passageService.returnPassageLocation(passage);
            return res.send("Done.");
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else{
            return res.send("Not enough stars!");
        }
    }
}

async function singleStarPassage(req, res){
    var user = req.session.user._id.toString();
    if(req.session && req.session.user){
        var p = await Passage.findOne({_id: req.body._id});
        //whether we are giving a star or taking it away
        if(req.body.on == 'false' && !p.starrers.includes(user)){
            var passage = await starQueue.singleStarPassage(req.session.user, p, false, false, null);
        }
        else if(req.body.on == 'true'){
            var passage = await starQueue.singleStarPassage(req.session.user, p, true, false, null);
        }
        else{
        }
        console.log(passage);
        return res.send("Done.");
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: true});
    }
    else{
        return res.render("Must be logged in.");
    }
}

async function borrowStars(req, res){
    if (!req.session.user) {
        return res.redirect('/loginform');
      }
      var user = await User.findOne({_id:req.session.user._id});
      if(req.session.user.phone == '' && !user.identityVerified){
        return res.send("You need a form of validation for that.");
      }
        var SYSTEM = await System.findOne({});
        // if(SYSTEM.userAmount == 0){
        //     var allowedQuantity = 50;
        // }
        // else{
        //     var allowedQuantity = (50 / SYSTEM.userAmount) * SYSTEM.totalStarsGiven;
        // }
        var allowedQuantity = 50;
      if(!isNaN(req.body.quantity) && req.body.quantity > 0 && req.body.quantity <= allowedQuantity){
        //check number of stars borrowed this month
        if(user.monthStarsBorrowed == null){
            user.monthStarsBorrowed = Date.now();
        }
        var today = new Date();
        //its been more than a month since they last got stars so reset the month we're looking at
        //TODO: Change to calculate if more than a month since they FIRST got stars
        if(monthsBetween(user.monthStarsBorrowed, today) > 0){
            user.monthStarsBorrowed = Date.now();
            user.starsBorrowedThisMonth = 0;
        }
        if(user.starsBorrowedThisMonth < 50){
            if( parseInt(req.body.quantity) + user.starsBorrowedThisMonth < 50){
                user.borrowedStars += Number(req.body.quantity);
                user.starsBorrowedThisMonth += Number(req.body.quantity);
            }else{
                return res.send("That would take you over your limit!");
            }
        }else{
            const monthName = user.monthStarsBorrowed.toLocaleString('default', { month: 'long' });
            return res.send("You have already borrowed the maximum number of stars for the month of "+monthName+".");
        }
        await user.save();
        return res.send(`You borrowed ${req.body.quantity} star${req.body.quantity == 1 ? '' : 's'}!`);
      }
      return res.send("Error.");
}

async function calculateDonationStars(req, res){
    var SYSTEM = await System.findOne({});
    var usd = SYSTEM.totalPaidOut;
    var price = Number(req.query.price);
    var starsGiven = SYSTEM.totalStarsGiven;
    var numDonationStars = 0;
    if(usd == 0){
        numDonationStars = price;
    }
    else if(starsGiven == 0){
        numDonationStars = 10;
    }else{
        var percentUSDAmount = await percentOfPayouts(price * 100);
        numDonationStars = percentUSDAmount * starsGiven;
    }
    return res.send(Math.floor(numDonationStars) + ' Donation Star' + (numDonationStars == 1 ? '' : 's'));
}

module.exports = {
    starPassage,
    singleStarPassage,
    borrowStars,
    calculateDonationStars
};