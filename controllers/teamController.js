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
    var usernamesToAdd = req.body.usernames.split('\n');
    const usersToAdd = await User.find({
        username: { $in: usernamesToAdd }
    }).select('_id');
    
    var newParticipantIds = usersToAdd
        .map(u => u._id);
    newParticipantIds = Object.values(newParticipantIds.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
    var newParticipantLedger = [{
        user: req.session.user._id.toString(),
        stars: 0,
        points: 0,
        options: {
            useGeneralStars: false
        }
    }];
    for(const id of newParticipantIds){
        newParticipantLedger.push({
            user: id,
            stars: 0,
            points: 0,
            options: {
                useGeneralStars: false
            }
        });
    }
    var team = await Team.create({
        leader: req.session.user._id.toString(),
        subscriptionAmount: req.body.subscriptionAmount,
        // open: req.body.open === 'on' ? true : false,
        name: req.body.name,
        description: req.body.description,
        members: newParticipantIds,
        ledger: newParticipantLedger
    });
    // var teamOpen = req.body.open === 'on' ? true : false;
    var rootPassage = await Passage.create({
        label: 'Project',
        title: req.body.name,
        author: req.session.user._id.toString(),
        users: [req.session.user._id.toString()],
        teamForRoot: team._id.toString(),
        // teamOpen: teamOpen,
        teamRootPassage: true,
        // team: teamOpen ? null : team._id.toString(),
        team: team._id.toString()
    });
    team.rootPassage = rootPassage;
    await team.save();
    team = await team.populate('leader rootPassage').execPopulate();
    return res.render('team-mini', {team: team});
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
async function addMembers(req, res){
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
    var newParticipantLedger = [];
    for(const id of newParticipantIds){
        newParticipantLedger.push({
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
            members: {
                $each: newParticipantIds
            },
            ledger: {
                $each: newParticipantLedger
            }
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
    var search = req.params.search || false;
    if(!search){
        console.log('feed');
        // Generate team feed
        const feedResult = await passageService.generateTeamFeed(teamId, page, 10);
        
        // Check if we need to redirect to a different page
        if (feedResult.redirect) {
            return res.redirect(`/teams/team/${teamId}?page=${feedResult.page}`);
        }

        // Process passages with getPassage to get all required data
        var passages = [];
        for (let i = 0; i < feedResult.feed.length; i++) {
            const processedPassage = await passageService.getPassage(feedResult.feed[i]);
            if(!processedPassage.teamRootPassage){
                passages.push(processedPassage);
            }
        }
        var totalPages = feedResult.totalPages;
        var currentPage = feedResult.currentPage;
        var totalItems = feedResult.totalItems;
    }else{
        console.log('search');
       var passages = await Passage.paginate({
        team: team._id,
        title: {$regex: req.params.search, $options:'i'}
       }, {
            sort: '-stars',
            page: req.query.page || 1,
            limit: DOCS_PER_PAGE,
            populate: passageService.standardPopulate
        }); 
        for (let i = 0; i < passages.docs.length; i++) {
            const processedPassage = await passageService.getPassage(passages.docs[i]);
        }
        var totalDocuments = await Passage.countDocuments({team: team._id});
        var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
        var currentPage = req.query.page || 1;
        var totalItems = passages.length;
        passages = passages.docs;
    } 
    return res.render("team", {
        team: team,
        feed: passages,
        totalPages: totalPages,
        currentPage: currentPage,
        totalItems: totalItems,
        search: search || false
    });
}
async function starPassage(req, res){
    
}
async function singleStarPassage(req, res){
    
}
async function editTeam(req, res){
    var team = await Team.findOne({_id: req.body._id});
    var usernamesToAdd = req.body.usernames.split('\n');
    const usersToAdd = await User.find({
        username: { $in: usernamesToAdd }
    }).select('_id');
    
    var newParticipantIds = usersToAdd
        .map(u => u._id);
    newParticipantIds = Object.values(newParticipantIds.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
    var newParticipantLedger = team.ledger;
    for(const id of newParticipantIds){
        if(!team.members.includes(id)){
            newParticipantLedger.push({
                user: id,
                stars: 0,
                points: 0,
                options: {
                    useGeneralStars: false
                }
            });
        }
    }
    // Remove ledger entries for users that are getting removed
    // (present in team.members but not in newParticipantIds)
    newParticipantLedger = newParticipantLedger.filter(ledger => {
        // Keep ledger entries for users that are still in the team
        for(const member of team.members){
            if(ledger.user.toString() === member.toString()){
                // If this member is in newParticipantIds, keep the ledger entry
                return newParticipantIds.some(id => id.toString() === member.toString());
            }
        }
        // Keep ledger entries for new members (not in original team.members)
        return true;
    });
    await Team.updateOne({_id:req.body._id}, {
        $set: {
            // subscriptionAmount: req.body.subscriptionAmount,
            // open: req.body.open === 'on' ? true : false,
            name: req.body.name,
            description: req.body.description,
            members: newParticipantIds,
            ledger: newParticipantLedger
        }
    });
    // var open = req.body.open === 'on' ? true : false;
    var open = false;
    if(open && !team.open){
        await Passage.updateOne({_id: team.rootPassage._id}, {
            $set: {
                team: null,
                teamOpen: open
            }
        });
        await Passage.updateMany({_id: team.rootPassage._id}, {
            $set: {
                teamOpen: open
            }
        });
    }
    else if(!open && team.open){
        await Passage.updateOne({_id: team.rootPassage._id}, {
            $set: {
                team: team._id.toString(),
                teamOpen: open
            }
        });
        await Passage.updateMany({_id: team.rootPassage._id}, {
            $set: {
                teamOpen: open
            }
        });
    }
    return res.send("Team updated");
}
module.exports = {
    teams,
    createTeam,
    deleteTeam,
    addMembers,
    removeMember,
    team,
    starPassage,
    singleStarPassage,
    editTeam
};