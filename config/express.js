'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
// const session = require('express-session');
const MongoStore = require('connect-mongo');
const { uploadConfig } = require('../middleware/upload');
const { updateActivityTimestamp } = require('../middleware/auth');
const { getUploadFolder } = require('../utils/fileUtils');
const { accessSecret, scripts } = require('../common-utils');
const { Passage } = require('../models/Passage');
const { User } = require('../models/User');

// Express app configuration

async function configureExpress() {
    const app = express();
    
    // Basic middleware
    app.use(helmet());
    app.use(compression());
    app.use(cors());
    app.use(express.urlencoded({ extended: true, limit: '250mb' }));
    app.use(express.json({
        verify: function (req, res, buf) {
            var url = req.originalUrl;
            if (url.startsWith('/stripe')) {
                req.rawBody = buf.toString();
            }
        }
    }));
    
    // File upload middleware (only use uploadConfig, not both)
    app.use(uploadConfig);
    
    // Session configuration (will need to be moved from sasame.js)
    // app.use(session({...}));
    var mongoUrl = await accessSecret("MONGODB_CONNECTION_URL");
    const session = require('express-session')({
        secret: "ls",
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ 
            mongoUrl: mongoUrl,
            ttl: 30 * 24 * 60 * 60, // 30 days TTL (in seconds)
            autoRemove: 'native',
            touchAfter: 24 * 3600 // Only update sessions every 24 hours
        }),
        cookie: {
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days (in milliseconds)
        }
    });
    app.use(session);
    
    // Store session middleware for Socket.IO
    app.set('session', session);
    
    // Set view engine
    app.set('view engine', 'ejs');
    app.set('views', './views');
    
    // Static files
    // app.use('/dist', express.static('dist'));
    app.use(express.static('./dist'));

    // Middleware to get client IP
    app.use((req, res, next) => {
        // Get IP from X-Real-IP header, which Nginx sets directly from $remote_addr
        const clientIp = req.headers['x-real-ip'];

        if (!clientIp) {
            // Fallback for direct connections or if X-Real-IP isn't set for some reason
            // This might be the Nginx server's IP if it's a direct connection
            console.warn('X-Real-IP header not found, falling back to req.connection.remoteAddress');
            req.clientIp = req.connection.remoteAddress;
        } else {
            req.clientIp = clientIp;
        }

        // Log the client IP (for demonstration)
        // console.log(`Client IP: ${req.clientIp}`);

        next();
    });
    
    // Global middleware for EJS locals
    app.use(async function(req, res, next) {
        // Shortcuts for ejs (from sasame.js lines 533-562)
        res.locals.getUploadFolder = getUploadFolder;
        res.locals.user = req.session.user;
        res.locals.DOMAIN = process.env.DOMAIN;
        res.locals.LOCAL = process.env.LOCAL;
        res.locals.scripts = scripts;
        
        if(!req.session.CESCONNECT){
            req.session.CESCONNECT = false;
        }
        res.locals.CESCONNECT = req.session.CESCONNECT;
        res.locals.fromOtro = req.query.fromOtro || false;
        //daemoncheck
        if(['simulation', 'market', 'orders', 'sales', 'market-dashboard', 'chat', '/api/chat/rooms', '/api/chat/search', '/api/chat/contacts/online',
            'simulated-passages', 'notifications', 'verify-identity', 'bank', 'feed', 'posts', 'comments', 'subforums', 'profile', '', 'passage', 'messages', 'leaderboard', 'donate', 'filestream', 'loginform', 'personal', 'admin', 'forum', 'projects', 'tasks', 'recover', 'recoverpassword'].includes(req.url.split('/')[1])){
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

async function regenerateSession(req){
        if(req.session.user){
            let user = await User.findOne({_id: req.session.user._id});
            req.session.user = user;
        }
    }
module.exports = {
    configureExpress
};