'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { uploadConfig } = require('../middleware/upload');
const { updateActivityTimestamp } = require('../middleware/auth');
const { getUploadFolder } = require('../utils/fileUtils');

// Express app configuration

function configureExpress() {
    const app = express();
    
    // Basic middleware
    app.use(helmet());
    app.use(compression());
    app.use(cors());
    app.use(express.urlencoded({ extended: true, limit: '250mb' }));
    
    // File upload middleware
    app.use(uploadConfig);
    
    // Session configuration (will need to be moved from sasame.js)
    // app.use(session({...}));
    
    // Set view engine
    app.set('view engine', 'ejs');
    app.set('views', './views');
    
    // Static files
    // app.use('/dist', express.static('dist'));
    app.use(express.static('./dist'));
    
    // Global middleware for EJS locals
    app.use(async function(req, res, next) {
        // Shortcuts for ejs (from sasame.js lines 533-562)
        res.locals.getUploadFolder = getUploadFolder;
        res.locals.user = req.session.user;
        res.locals.DOMAIN = process.env.DOMAIN;
        res.locals.LOCAL = process.env.LOCAL;
        
        if(!req.session.CESCONNECT){
            req.session.CESCONNECT = false;
        }
        res.locals.CESCONNECT = req.session.CESCONNECT;
        res.locals.fromOtro = req.query.fromOtro || false;
        //daemoncheck
        if(['simulation', 'simulated-passages', 'notifications', 'verify-identity', 'bank', 'feed', 'posts', 'comments', 'subforums', 'profile', '', 'passage', 'messages', 'leaderboard', 'donate', 'filestream', 'loginform', 'personal', 'admin', 'forum', 'projects', 'tasks', 'recover', 'recoverpassword'].includes(req.url.split('/')[1])){
            let daemons = [];
            if(req.session.user){
                let user = await User.findOne({_id: req.session.user._id}).populate('daemons');
                regenerateSession(req);
                daemons = user.daemons;
            }
            let defaults = await Passage.find({default_daemon: true}).populate('author users sourceList collaborators versions');
            if(defaults.length > 0)
                daemons = daemons.concat(defaults);
            for(var i = 0; i < daemons.length; ++i){
                daemons[i] = await getPassage(daemons[i]);
            }
            res.locals.DAEMONS = daemons;
        }
        next();
    });
    
    // Activity timestamp middleware
    app.use(['/feed', '/posts', '/profile', '/passage'], updateActivityTimestamp);

    // Apply isAdminLoggedIn first to set the isAdmin flag
    app.use(isAdminLoggedIn);

    // Apply the under construction enforcement
    app.use(enforceUnderConstruction);

    // Route for the under construction page itself
    app.get('/under-construction', sendUnderConstruction);
    
    return app;
}
const isAdminLoggedIn = (req, res, next) => {
      if (req.session.user && req.session.user.admin === true) {
        req.isAdmin = true; // Set a flag for the next middleware
        return next();
      }
      req.isAdmin = false;
      next();
    };

const enforceUnderConstruction = (req, res, next) => {
  const allowedPaths = [
    '/loginform',
    '/jquery-ui.min.js',
    '/jquery-ui.css',
    '/jquery.modal.min.js',
    '/jquery.modal.js',
    '/jquery.modal.min.css',
    '/data.json',
    '/ionicons.esm.js',
    '/ionicons.js',
    '/p-9c97a69a.js',
    '/p-c1aa32dd.entry.js',
    '/p-85f22907.js',
    '/quill.snow.css',
    '/quill.min.js',
    '/highlight.css',
    '/highlight.js',
    '/caret-down.svg',
    '/jquery.min.js',
    '/under-construction',
    '/get_bookmarks',
    '/get_daemons'
  ];

  // Allow all requests from admins
  if (req.isAdmin) {
    return next();
  }

  // For non-admins, enforce under construction for non-allowed GET requests
  if (process.env.UNDER_CONSTRUCTION == 'true' && req.method === 'GET' && !allowedPaths.includes(req.path)) {
    return res.redirect(302, '/under-construction'); // Redirect to the under construction page
  }

  next(); // Allowed GET path or a non-GET request for non-admins
};

const sendUnderConstruction = (req, res) => {
  return res.status(503).send('<h1>Under Construction</h1><p>We are currently working on the site. Please check back later.</p>');
};
module.exports = {
    configureExpress
};