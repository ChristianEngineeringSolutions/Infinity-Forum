'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');

// Get user's daemons
const getDaemons = async (req, res) => {
    let daemons = [];
    if(req.session.user){
        let user = await User.findOne({_id: req.session.user._id}).populate('daemons');
        daemons = user.daemons;
    }
    let defaults = await Passage.find({default_daemon: true}).populate('author users sourceList');
    daemons = daemons.concat(defaults);
    res.render('daemons', {daemons: daemons});
};

// Add daemon to user
const addDaemon = async (req, res) => {
    if(req.session.user){
        let passage = req.body._id;
        let daemon = await Passage.findOne({_id: passage});
        let user = await User.findOne({_id: req.session.user._id});
        user.daemons.push(daemon);
        user.markModified('daemons');
        await user.save();
        return res.render('daemons', {daemons: user.daemons});
    }
    else{
        return res.send('false');
    }
};

// Remove daemon from user
const removeDaemon = async (req, res) => {
    if(req.session.user){
        let passage = req.body._id;
        let daemon = await Passage.findOne({_id: passage});
        let user = await User.findOne({_id: req.session.user._id});
        var i = 0;
        for(const d of user.daemons){
            if(d._id.toString() == daemon._id.toString()){
                user.daemons.splice(i, 1);
            }
            ++i;
        }
        user.markModified('daemons');
        await user.save();
        return res.render('daemons', {daemons: user.daemons});
    }
    else{
        return res.send('false');
    }
};

// Sort user's daemons
const sortDaemons = async (req, res) => {
    if(req.session.user){
        var user = await User.findOne({_id: req.session.user._id});
        var daemonOrder = [];
        if(typeof req.body.daemonOrder != 'undefined'){
            var daemonOrder = JSON.parse(req.body.daemonOrder);
            let trimmedDaemonOrder = daemonOrder.map(str => str.trim());
            user.daemons = trimmedDaemonOrder;
            user.markModified('daemons');
            await user.save();
        }
        //give back updated passage
        return res.send('Done');
    }
    else{
        return res.send('false');
    }
};

module.exports = {
    getDaemons,
    addDaemon,
    removeDaemon,
    sortDaemons
};