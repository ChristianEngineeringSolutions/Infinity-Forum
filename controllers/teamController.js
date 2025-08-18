'use strict';

const Team = require('../models/Team');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');
const { scripts, DOCS_PER_PAGE} = require('../common-utils');
const passageService = require('../services/passageService');

async function teams(req, res){
    var page = req.query.page || 1;
    var ownerFocus = req.query.ownerFocus || false;
    var memberFocus = req.query.memberFocus || false;
    var bothFocus = req.query.bothFocus || false;
    var noFocus = !ownerFocus && !memberFocus && !bothFocus;
    var sessionUser = req.session.user._id.toString();
    var search = req.query.search;
    if(noFocus){
        bothFocus = true;
    }
    var find = {};
    if(ownerFocus){
        find.leader = sessionUser;
    }
    if(memberFocus){
        find.members = {$in: [sessionUser]};
    }
    if(bothFocus){
        find.$or = [
            {leader:sessionUser},
            {members: {$in: [sessionUser]}}
        ];
    }
    if(search){
        find.name = {$regex: search, $options: 'i'};
    }
    var teams = await Team.paginate(find, {
        sort: '-dateCreated',
        page: page,
        limit: DOCS_PER_PAGE,
        populate: 'leader members'
    });
    var totalDocuments = await Team.countDocuments(find);
    var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    return res.render('teams', {teams: teams.docs, totalPages: totalPages, page: page});
}
async function createTeam(req, res){
    var team = await Team.create({
        leader: req.session.user._id.toString(),
        subscriptionAmount: req.body.subscriptionAmount,
        open: req.body.open,
        ledger: [{
            user: req.session.user._id.toString(),
            stars: 0,
            points: 0,
            options: {
                useGeneralStars: false
            }
        }]
    });
    return res.render('team', {team: team});
}
async function deleteTeam(req, res){
    var team = await Team.findOne({_id: req.body.teamId});
    if(team.leader._id.toString() !== req.session.user._id.toString()){
        return res.send("You dont have permission to delete that team.");
    }
    await Passage.deleteMany({team: req.body.teamId});
    await Team.deleteOne({_id: req.body.teamId});
    return res.send("Team deleted.");
}
async function addMember(req, res){
    var team = await Team.findOne({_id: req.body.teamId});
    if(team.leader._id.toString() !== req.session.user._id.toString()){
        return res.send("You dont have permission.");
    }
    var usernamesToAdd = req.body.usernames.split('\n');
    const usersToAdd = await User.find({
        username: { $in: usernamesToAdd }
    }).select('_id');
    
    const newParticipantIds = usersToAdd
        .map(u => u._id)
        .filter(id => !team.members.includes(id));
    
    if (newParticipantIds.length === 0) {
        return res.send("No members to add."); // No new participants to add
    }
    var newParticipantLedgers = [];
    for(const id of newParticipantIds){
        newParticipantLedgers.push({
            user: id,
            stars: 0,
            points: 0,
            options: {
                useGeneralStars: false
            }
        });
    }
    await Team.updateOne({_id: team._id}, {
        $push: {
            members: newParticipantIds,
            ledger: newParticipantLedgers
        }
    });
}
async function removeMember(req, res){
    var team = await Team.findOne({_id: req.body.teamId});
    if(team.leader._id.toString() !== req.session.user._id.toString()){
        return res.send("You dont have permission.");
    }
    var username = req.body.username;
    username = await User.findOne({
        username: username
    }).select('_id');
    username = username._id.toString();
    var index = team.members.indexOf(username);
    var ledger = team.ledger[index];
    await Team.updateOne({_id: team._id}, {$pull: {members: username, ledger: ledger}});
}
async function team(req, res){
    const teamId = req.params.teamId;
    const page = parseInt(req.query.page) || 1;
    const sessionUserId = req.session.user._id.toString();
    
    // Get team with populated data
    const team = await Team.findOne({_id: teamId}).populate('rootPassage leader members ledger.user');
    
    if (!team) {
        return res.status(404).send("Team not found.");
    }
    
    // Check if user is team leader or member
    const isLeader = team.leader._id.toString() === sessionUserId;
    const isMember = team.members.some(member => member._id.toString() === sessionUserId);
    
    if (!isLeader && !isMember) {
        return res.status(403).send("You don't have permission to view this team.");
    }
    
    // Generate team feed
    const feedResult = await passageService.generateTeamFeed(teamId, page, 10);
    
    // Check if we need to redirect to a different page
    if (feedResult.redirect) {
        return res.redirect(`/teams/team/${teamId}?page=${feedResult.page}`);
    }
    
    return res.render("team", {
        team: team,
        feed: feedResult.feed,
        totalPages: feedResult.totalPages,
        currentPage: feedResult.currentPage,
        totalItems: feedResult.totalItems
    });
}
async function starPassage(req, res){
    
}
async function singleStarPassage(req, res){
    
}
module.exports = {
    teams,
    createTeam,
    deleteTeam,
    addMember,
    removeMember,
    team,
    starPassage,
    singleStarPassage
};