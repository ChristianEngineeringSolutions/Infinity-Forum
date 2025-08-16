'use strict';

const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { requiresLogin } = require('../middleware/auth');

//bound to /teams

router.get('/', requiresLogin, teamController.teams);
router.post('/create-team', requiresLogin, teamController.createTeam);
router.post('/delete-team', requiresLogin, teamController.deleteTeam);
router.post('/add-member', requiresLogin, teamController.addMember);
router.post('/remove-member', requiresLogin, teamController.removeMember);
router.get('/team/:teamId', requiresLogin, teamController.team);
router.post('/star/:passageId', requiresLogin, teamController.starPassage);
router.post('/single-star/:passageId', requiresLogin, teamController.singleStarPassage);

module.exports = router;