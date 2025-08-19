'use strict';

const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { requiresLogin } = require('../middleware/auth');

//bound to /teams

router.get('/', requiresLogin, teamController.teams);
router.post('/create-team', requiresLogin, teamController.createTeam);
router.post('/edit-team', requiresLogin, teamController.editTeam);
router.post('/delete-team', requiresLogin, teamController.deleteTeam);
router.post('/add-members', requiresLogin, teamController.addMembers);
router.post('/remove-member', requiresLogin, teamController.removeMember);
router.get('/team/:teamId/:search?', requiresLogin, teamController.team);
router.post('/star/:passageId', requiresLogin, teamController.starPassage);
router.post('/single-star/:passageId', requiresLogin, teamController.singleStarPassage);

module.exports = router;