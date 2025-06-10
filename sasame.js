'use strict';
(async function(){
    const {accessSecret, 
    scripts, percentStarsGiven,
     percentUSD, totalUSD, 
     totalStarsGiven} = require('./common-utils');
    const rateLimit = require('express-rate-limit');
    const express = require('express');
    const fileUpload = require('express-fileupload');
    const querystring = require('querystring');
    const bcrypt = require('bcrypt');
    const crypto = require('crypto');
    const mongoose = require('mongoose');
    const bodyParser = require("body-parser");
    const helmet = require('helmet');
    const emitter = require('events').EventEmitter;
        emitter.setMaxListeners(20); // Increased to a higher number
    const cors = require("cors");
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    require('dotenv').config();
    const PORT = process.env.PORT || 3000;
    var http = require('http');
    const https = require('https');
    var compression = require('compression');
    const { promisify } = require('util');
    const request = promisify(require('request'));
    const browser = require('browser-detect');
    var ffmpeg = require('fluent-ffmpeg');
    const linkPreview = require('link-preview-js');
    const axios = require("axios"); //you can use any http client
    // const tf = require("@tensorflow/tfjs-node");
    // const nsfw = require("nsfwjs");
    var fs = require('fs'); 
    const fsp = require('fs').promises;
    const jwt = require('jsonwebtoken');

    const redis = require('redis');
    const Queue = require('bull');

    // Initialize Redis client with promisification
    let redisClient;
    if (process.env.REDIS_URL) {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
    } else {
      redisClient = redis.createClient();
    }

    // Promisify Redis methods
    const redisGet = promisify(redisClient.get).bind(redisClient);
    const redisSet = promisify(redisClient.set).bind(redisClient);
    const redisDel = promisify(redisClient.del).bind(redisClient);

    // Create a Bull queue for feed generation
    const feedQueue = new Queue('feed-generation', process.env.REDIS_URL || 'redis://localhost:6379');
    //for daemons access to help code
    function DAEMONLIBS(passage, USERID){
        return `
        
        var THIS = `+JSON.stringify(passage)+`;
        var USERID = "`+(USERID)+`";
        // async function INTERACT(content){
        //     const result = await $.ajax({
        //         type: 'post',
        //         url: '`+process.env.DOMAIN+`/interact',
        //         data: {
        //             _id: _id
        //         }});
        //     return result;
        // }
        async function GETDAEMON(daemon, param){
            var passage = await GETPASSAGE(daemon);
            var code = passage.code;
            var parameter = await GETPASSAGE(param);
            //add Param Line
            code = "const PARAM = " + JSON.stringify(parameter) + ';' + code;
            
            //then eval code
            return code;
        }
        async function GETPASSAGE(_id){
            //run ajax
            const result = await $.ajax({
                type: 'get',
                url: '`+process.env.DOMAIN+`/get_passage',
                data: {
                    _id: _id
                }});
            return result;
        }
        
        `;
    }
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

    // Models
    const {User, UserSchema} = require('./models/User');
    const { Passage, PassageSchema } = require('./models/Passage');
    const Interaction = require('./models/Interaction');
    const Category = require('./models/Category');
    const Subcat = require('./models/Subcat');
    const Subforum = require('./models/Subforum');
    const Visitor = require('./models/Visitor');
    const Follower = require('./models/Follower');
    const Notification = require('./models/Notification');
    
    // Import fake data generation functions
    const fakeDataGenerator = require('./dist/js/fake.js');
    
    // Server-side function to create fake passages directly (expects users to already be registered via HTTP)
    async function createFakePassageDirectly(fakeUserData, useAIContent = true, includeImage = false, parent='root') {
        try {
            // Find the fake user in database (should already exist from HTTP registration)
            let user = await User.findOne({ username: (fakeUserData.username + '.1') });
            if (!user) {
                console.error(`Fake user ${fakeUserData.username} not found in database after HTTP registration`);
                return null;
            }
            
            // Generate passage data
            const passageData = fakeDataGenerator.generateFakePassage(user, useAIContent, includeImage);
            
            // Create passage directly in database using createPassage function
            const mockReq = {
                session: { user: user },
                body: {
                    ...passageData,
                    customDate: passageData.date
                }
            };
            
            // Use the existing createPassage function
            const passage = await createPassage(user, parent, false, true, passageData.date, true);
            for (let key in passageData) {
              if (passageData.hasOwnProperty(key)) {
                passage[key] = passageData[key];
              }
            }

            if (passage && passage._id) {
                // Apply create_initial_passage logic for public/forum determination
                const labelOptions = [
                    "Project", 'Idea', 'Database', "Social", "Question", 
                    "Comment", "Task", "Forum", "Challenge", "Article"
                ];
                
                // Validate label
                if (!labelOptions.includes(passage.label)) {
                    passage.label = "Project"; // Default fallback
                }
                
                // Set public and forum properties based on label
                switch(passage.label) {
                    case 'Project':
                    case 'Idea':
                    case 'Database':
                    case 'Article':
                        passage.public = false;
                        passage.forum = false;
                        break;
                    case 'Social':
                    case 'Question':
                    case 'Comment':
                    case 'Task':
                    case 'Challenge':
                        passage.public = true;
                        passage.forum = false;
                        break;
                    case 'Forum':
                        passage.public = true;
                        passage.forum = true;
                        break;
                    default:
                        passage.public = false;
                        passage.forum = false;
                }
                
                // Save the updated passage with public/forum properties
                await passage.save();
                
                console.log(`Created fake passage: "${passageData.title}" by ${user.username} (${passage.label}, public: ${passage.public}, forum: ${passage.forum})`);
                return passage;
            } else {
                console.error('Failed to create fake passage');
                return null;
            }
            
        } catch (error) {
            console.error('Error creating fake passage directly:', error);
            return null;
        }
    }
    
    // Server-side function to create fake sub-passages directly
    async function createFakeSubPassagesDirectly(parentPassage, users, maxSubPassages = 5, parent) {
        try {
            const numSubPassages = Math.floor(Math.random() * maxSubPassages) + 1;
            const createdSubPassages = [];
            
            for (let i = 0; i < numSubPassages; i++) {
                const randomUser = users[Math.floor(Math.random() * users.length)];
                
                // Generate sub-passage data
                const subPassageData = {
                    chief: parentPassage._id.toString(),
                    parent: parentPassage._id,
                    title: '', // Sub-passages typically have no title
                    content: fakeDataGenerator.getRandomAIPost ? 
                        fakeDataGenerator.getRandomAIPost() : 
                        require('@faker-js/faker').faker.lorem.sentences(Math.floor(Math.random() * 3) + 1),
                    label: 'Comment',
                    lang: 'rich',
                    simulated: true,
                    customDate: require('@faker-js/faker').faker.date.recent({ days: 30 }).toISOString()
                };
                
                const mockReq = {
                    session: { user: randomUser },
                    body: subPassageData
                };
                
                // const subPassage = await createPassage(mockReq);
                const subPassage = await createPassage(user, parent, false, true, passageData.date, true);
                for (let key in passageData) {
                  if (passageData.hasOwnProperty(key)) {
                    passage[key] = passageData[key];
                  }
                }
                
                if (subPassage && subPassage._id) {
                    // Set comment and public properties based on parent label
                    if (parentPassage.label === 'Challenge') {
                        subPassage.comment = false;
                        subPassage.public = false;
                    } else if (parentPassage.label === 'Project') {
                        subPassage.comment = true;
                        subPassage.public = true;
                    } else {
                        // Default for other parent types
                        subPassage.comment = true;
                        subPassage.public = true;
                    }
                    
                    await subPassage.save();
                    
                    createdSubPassages.push(subPassage);
                    console.log(`Created sub-passage for: "${parentPassage.title}" by ${randomUser.username} (comment: ${subPassage.comment}, public: ${subPassage.public})`);
                }
            }
            
            return createdSubPassages;
        } catch (error) {
            console.error('Error creating fake sub-passages directly:', error);
            return [];
        }
    }
    const Star = require('./models/Star');
    const JTI = require('./models/JTI');
    const System = require('./models/System');
    const VerificationSession = require('./models/VerificationSession');
    //one time function
    // (async function(){
    //     var SYSTEM = await System.findOne({});
    //     if(SYSTEM == null){
    //         await System.create({
    //             totalStarsGiven: 0,
    //             numUsersOnboarded: 0,
    //             lastUpdated: Date.now()
    //         });
    //         SYSTEM = await System.findOne({});
    //     }
    //     if(SYSTEM.totalStarsGiven == 0){
    //         //one time function to set system stars given equal to the correct amount
    //         var users = await User.find({});
    //         var total = 0;
    //         for(const user of users){
    //             total += user.starsGiven;
    //         }
    //         SYSTEM.totalStarsGiven = total;
    //         //one time function to set system num users to current num users
    //         let onboarded = await User.find({stripeOnboardingComplete: true});
    //         SYSTEM.numUsersOnboarded = onboarded.length;
    //         await SYSTEM.save();
    //     }

    // })();
    //one time function
    // (async function(){
    //     var SYSTEM = await System.findOne({});
    //     const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    //     const stripe = require("stripe")(STRIPE_SECRET_KEY);
    //     const balance = await stripe.balance.retrieve();
    //     var usd = 0;
    //     for(const i of balance.available){
    //         if(i.currency == 'usd'){
    //             usd = i.amount;
    //             break;
    //         }
    //     }
    //     SYSTEM.userAmount = usd * 0.45;
    //     SYSTEM.platformAmount = usd * 0.55;
    //     await SYSTEM.save();
    //     console.log("SYSTEM amounts updated.");

    // })();
    async function setupDatabaseIndexes() {
      try {
        console.log("Setting up database indexes...");
        
        // Create indexes one by one with error handling
        const indexOperations = [
          // Basic indexes
          { collection: 'passages', index: { versionOf: 1 } },
          { collection: 'passages', index: { personal: 1 } },
          { collection: 'passages', index: { deleted: 1 } },
          { collection: 'passages', index: { author: 1 } },
          { collection: 'passages', index: { sourceList: 1 } },
          { collection: 'passages', index: { date: -1 } },
          { collection: 'passages', index: { stars: -1 } },
          
          // Compound indexes
          { 
            collection: 'passages', 
            index: { versionOf: 1, personal: 1, deleted: 1, date: -1, stars: -1 },
            options: { name: 'feed_main_index' }
          },
          { 
            collection: 'passages', 
            index: { versionOf: 1, personal: 1, deleted: 1, author: 1 },
            options: { name: 'feed_author_index' }
          },
          { 
            collection: 'passages', 
            index: { versionOf: 1, personal: 1, deleted: 1, "passages.0": 1 },
            options: { name: 'feed_passages_index' }
          },
          
          // Index for followers
          { 
            collection: 'followers', 
            index: { user: 1, following: 1 },
            options: { name: 'follower_index' }
          }
        ];
        
        // Create indexes sequentially to avoid overwhelming the database
        for (const op of indexOperations) {
          try {
            // Get the model that corresponds to the collection name
            const modelName = op.collection.charAt(0).toUpperCase() + op.collection.slice(1, -1);
            const Model = mongoose.model(modelName);
            
            // console.log(`Creating index on ${op.collection}: ${JSON.stringify(op.index)}`);
            
            // Create the index
            await Model.collection.createIndex(op.index, op.options || {});
            
            // console.log(`Successfully created index on ${op.collection}: ${JSON.stringify(op.index)}`);
          } catch (indexError) {
            // Don't fail the entire operation if one index fails
            console.error(`Error creating index on ${op.collection} ${JSON.stringify(op.index)}:`, indexError);
          }
        }
        
        console.log("Database indexes setup complete");
      } catch (error) {
        console.error("Error setting up database indexes:", error);
      }
    }
    setupDatabaseIndexes();
    // Controllers
    const passageController = require('./controllers/passageController');
     // Routes
    // const passageRoutes = require('./routes/passage');

    const { google } = require('googleapis');
    var fs = require('fs'); 
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    const async = require('async');
    // const pLimit = await import('p-limit');
    // const pRetry = await import('p-retry');
    var path = require('path');
    const { exec } = require('child_process');
    const { v4 } = require('uuid');
    const magic = require('magic-number'); // For magic number detection

    const FormData = require('form-data');

    const writeFile = promisify(fs.writeFile);
    const readdir = promisify(fs.readdir);
    //pagination for home and profile
    const DOCS_PER_PAGE = 10; // Documents per Page Limit (Pagination)
    
    // Database Connection Setup
    mongoose.connect((await accessSecret("MONGODB_CONNECTION_URL")), {
        useNewUrlParser: true,
        useCreateIndex: true,
        useFindAndModify: false,
        useUnifiedTopology: true
    }).then(() => {
        console.log('Connected to MongoDB');
    }).catch((err) => {
        console.error('MongoDB connection error:', err);
        // Implement proper cleanup
        process.exit(1);
    });

    var app = express();
    var server = http.Server(app);
    var isShuttingDown = false;

    //socket io
    const io = require('socket.io')(server);
    const BKP = require('mongodb-snapshot');
    async function mongoSnap(path, restore = false) {
        console.log("TEST");
        const mongo_connector = new BKP.MongoDBDuplexConnector({
            connection: { uri: await accessSecret(MONGODB_CONNECTION_URL), dbname: 'sasame' }
        });
        const localfile_connector = new BKP.LocalFileSystemDuplexConnector({
            connection: { path: path }
        });
        const transferer = restore ? 
            new BKP.MongoTransferer({ source: localfile_connector, targets: [mongo_connector] }) : 
            new BKP.MongoTransferer({ source: mongo_connector, targets: [localfile_connector] }) ;
        for await (const { total, write } of transferer) { }
    }

    // const io = require("socket.io")(server, {
    //     cors: {
    //       origin: "https://example.com",
    //       methods: ["GET", "POST"],
    //       allowedHeaders: ["my-custom-header"],
    //       credentials: true
    //     }
      // });
    app.use(express.urlencoded({ extended: true, limit: '250mb' }));
    app.use(compression());
    app.use(cors());
    app.use(helmet());
    app.use(fileUpload());

    const labelOptions = [
        "Project",
        'Idea',
        'Database',
        "Social",
        "Question",
        "Comment",
        "Task",
        "Forum",
        "Challenge",
        "Article"
    ];

    // make sure recordings folder exists
    const recordingFolder = './dist/recordings/';
    if (!fs.existsSync(recordingFolder)) {
      fs.mkdirSync(recordingFolder);
    }


    // Setup Frontend Templating Engine - ejs
    const ejs = require('ejs');

    // app.use(bodyParser.json({limit: '50mb'}));
    app.use(bodyParser.json({
        verify: function (req, res, buf) {
          var url = req.originalUrl;
          if (url.startsWith('/stripe')) {
             req.rawBody = buf.toString();
          }
        }
      }));
      
    // app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

    const MongoStore  = require('connect-mongo');

    // User Session Setup Logic
    // const session = require('express-session')({
    //     secret: "ls",
    //     resave: true,
    //     saveUninitialized: true,
    //     store: MongoStore.create({ mongoUrl: process.env.MONGODB_CONNECTION_URL })
    // });
    //log in time
    const session = require('express-session')({
        secret: "ls",
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ 
            mongoUrl: await accessSecret("MONGODB_CONNECTION_URL"),
            ttl: 30 * 24 * 60 * 60, // 30 days TTL (in seconds)
            autoRemove: 'native',
            touchAfter: 24 * 3600 // Only update sessions every 24 hours
        }),
        cookie: {
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days (in milliseconds)
        }
    });
    var sharedsession = require("express-socket.io-session");
    const cookieParser = require('cookie-parser');
    const nodemailer = require('nodemailer');
    
    app.use(cookieParser());
    app.use(session);
    io.use(sharedsession(session, {
        autoSave: true
    }));
    // app.use('/protected/:pID', async function(req, res, next){
    //     if(!req.session.user){
    //         return res.redirect('/');
    //     }
    //     else{
    //         var passage = await Passage.findOne({filename:req.params.pID});
    //         if(passage != null)
    //         if(passage.author._id.toString() != req.session.user._id.toString() && !scripts.isPassageUser(req.session.user, passage)){
    //             return res.redirect('/');
    //         }
    //     }
    //     next();
    // });
    app.use(express.static('./dist'));
    app.set('view engine', 'ejs');
    app.set('views', './views');
    function getUploadFolder(passage){
        return passage.personal ? 'protected' : 'uploads';
    }
    app.use(async function(req, res, next) {
        //shortcuts for ejs
        res.locals.getUploadFolder = getUploadFolder;
        res.locals.user = req.session.user;
        res.locals.daemonLibs = DAEMONLIBS;
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
    // UNDER CONSTRUCTION PAGE
    // app.all('*', async (req, res) => {
    //     res.render('construction');
    // });
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

    // Apply isAdminLoggedIn first to set the isAdmin flag
    app.use(isAdminLoggedIn);

    // Apply the under construction enforcement
    app.use(enforceUnderConstruction);

    // Add this middleware to common routes to periodically update lastLogin
    function updateActivityTimestamp(req, res, next) {
        if (!req.session.user) {
            return next();
        }
        
        // Only update if it's been more than 30 minutes since last update
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        // Check if we need to update (avoid excessive database writes)
        if (!req.session.user.lastLogin || new Date(req.session.user.lastLogin) < thirtyMinutesAgo) {
            // Update in database
            User.findByIdAndUpdate(req.session.user._id, {
                lastLogin: new Date()
            }).catch(err => console.error('Error updating activity timestamp:', err));
            
            // Also update in session
            req.session.user.lastLogin = new Date();
        }
        
        next();
    }

    // Then apply this middleware to key routes:
    app.use(['/feed', '/posts', '/profile', '/passage'], updateActivityTimestamp);

    // Route for the under construction page itself
    app.get('/under-construction', sendUnderConstruction);

    // --- Routes that must work under construction ---
    app.get('/loginform', function(req, res){
        res.render('login_register', {scripts: scripts});
      });
    app.get('/get_bookmarks', async (req, res) => {
        // let bookmarks = [];
        // if(req.session.user){
        //     let user = await User.findOne({_id: req.session.user._id}).populate('bookmarks');
        //     bookmarks = user.bookmarks;
        // }
        // for(const bookmark of bookmarks){
        //     bookmarks[bookmark] = bubbleUpAll(bookmark);
        // }
        var bookmarks = await Bookmark.find({user: req.session.user}).sort('-_id').populate('passage');
        // for(const bookmark of bookmarks){
        //     bookmarks[bookmark].passage = bubbleUpAll(bookmark.passage);
        // }
        for(const bookmark of bookmarks){
            try{
            if(bookmark.passage != null){
                if(bookmark.passage.mirror != null){
                    if(bookmark.passage.mirrorEntire){
                        var mirror = await Passage.findOne({_id:bookmark.passage.mirror._id});
                        if(mirror != null){
                            bookmark.passage.title = mirror.title;
                        }else{
                            bookmark.mirror.title = 'Error (Working on it)';
                        }
                    }
                }
                if(bookmark.passage.bestOf != null){
                    if(bookmark.passage.bestOfEntire){
                        var mirror = await Passage.findOne({parent:bookmark.passage.bestOf._id}).sort('-stars');
                        if(mirror != null){
                            bookmark.passage.title = mirror.title;
                        }else{
                            bookmark.mirror.title = 'Error (Working on it)';
                        }
                    }
                }
            }
            }catch(e){
                console.log(e);
            }
        }
        res.render('bookmarks', {bookmarks: bookmarks});
    });
    app.get('/get_daemons', async (req, res) => {
        let daemons = [];
        if(req.session.user){
            let user = await User.findOne({_id: req.session.user._id}).populate('daemons');
            daemons = user.daemons;
        }
        let defaults = await Passage.find({default_daemon: true}).populate('author users sourceList');
        daemons = daemons.concat(defaults);
        res.render('daemons', {daemons: daemons});
    });
    //Serving Files
    app.get('/jquery.min.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery/dist/jquery.min.js');
    });
    app.get('/jquery-ui.min.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery-ui-dist/jquery-ui.min.js');
    });
    app.get('/jquery-ui.css', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery-ui-dist/jquery-ui.css');
    });
    app.get('/jquery.modal.min.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery-modal/jquery.modal.min.js');
    });
    app.get('/jquery.modal.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery-modal/jquery.modal.js');
    });
    app.get('/jquery.modal.min.css', function(req, res) {
        res.sendFile(__dirname + '/node_modules/jquery-modal/jquery.modal.min.css');
    });
    app.get('/data.json', function(req, res) {
        res.sendFile(__dirname + '/data.json');
    });
    app.get('/ionicons.esm.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/ionicons/dist/ionicons/ionicons.esm.js');
    });
    app.get('/ionicons.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/ionicons/dist/ionicons/ionicons.js');
    });
    app.get('/p-9c97a69a.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/ionicons/dist/ionicons/p-9c97a69a.js');
    });
    app.get('/p-c1aa32dd.entry.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/ionicons/dist/ionicons/p-c1aa32dd.entry.js');
    });
    app.get('/p-85f22907.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/ionicons/dist/ionicons/p-85f22907.js');
    });
    app.get('/quill.snow.css', function(req, res) {
        res.sendFile(__dirname + '/node_modules/quill/dist/quill.snow.css');
    });
    app.get('/quill.min.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/quill/dist/quill.min.js');
    });
    app.get('/highlight.css', function(req, res) {
        res.sendFile(__dirname + '/node_modules/highlight.js/styles/a11y-light.css');
    });
    app.get('/highlight.js', function(req, res) {
        res.sendFile(__dirname + '/node_modules/highlight.js/lib/index.js');
    });
    app.get('/caret-down.svg', function(req, res) {
        res.send(__dirname + '/node_modules/ionicons/dist/svg/caret-down.svg');
    });


    // --- THEN, THE CATCH-ALL UNDER CONSTRUCTION ROUTE ---
    // app.get('*', sendUnderConstruction);

    // ... your other routes (e.g., POST for login, etc.) ...


    //CRON
    var cron = require('node-cron');
    const { exit } = require('process');
    const { response } = require('express');
    const e = require('express');
    const Message = require('./models/Message');
    const { copyPassage } = require('./controllers/passageController');
    const Bookmark = require('./models/Bookmark');
    // const { getMode } = require('ionicons/dist/types/stencil-public-runtime');
    //Get total star count and pay out users
    var {
    queueRewardDistribution,
    getRewardJobStatus,
    cleanupOldJobs,
    rewardQueue,
    } = require('./reward-users');
    //run monthly cron
    cron.schedule('0 12 1 * *', async () => {
        //reward users
        (async function(){
            // Queue a reward distribution
            const result = await queueRewardDistribution();
            console.log(`Job ID: ${result.jobId}`);

            // Check status
            const status = await getRewardJobStatus(result.jobId);
            console.log(`Status: ${status.state}, Progress: ${status.progress}%`);

            // Clean up old jobs
            await cleanupOldJobs(7); // Remove jobs older than 7 days
        })();
        console.log('Monthly Cron ran at 12pm.');
    });
    // (async function(){
    //         // Queue a reward distribution
    //         const result = await queueRewardDistribution();
    //         console.log(`Job ID: ${result.jobId}`);

    //         // Check status
    //         const status = await getRewardJobStatus(result.jobId);
    //         console.log(`Status: ${status.state}, Progress: ${status.progress}%`);

    //         // Clean up old jobs
    //         await cleanupOldJobs(7); // Remove jobs older than 7 days
    //     })();
    // Schedule periodic feed updates for active users
    cron.schedule('0 */3 * * *', async () => { // Every 3 hours
    try {
      // Find active users (those who logged in within last 7 days)
      const activeTimeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeUsers = await User.find({
        lastLogin: { $gte: activeTimeThreshold }
      });
      
      console.log(`Scheduling feed updates for ${activeUsers.length} active users`);
      
      // Add jobs to queue with different priorities based on user activity
      for (const user of activeUsers) {
        const hoursSinceLastLogin = (Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60);
        
        // Determine job priority based on activity
        let priority = 3; // Default priority
        
        if (hoursSinceLastLogin < 24) {
          priority = 1; // High priority for very active users
        } else if (hoursSinceLastLogin < 72) {
          priority = 2; // Medium priority for moderately active users
        }
        
        // Schedule job
        await feedQueue.add(
          { userId: user._id.toString() },
          { priority }
        );
      }
    } catch (error) {
      console.error('Error scheduling feed updates:', error);
    }
    });
    //remove payment locks and reset amountEarnedThisYear
    // cron.schedule('0 0 1 1 *', async () => {
    //     var users = await User.find({});
    //     for(const user of users){
    //         user.paymentsLocked = false;
    //         user.amountEarnedThisYear = 0;
    //         await user.save();
    //     }
    // });
    function monthDiff(d1, d2) {
        var months;
        months = (d2.getFullYear() - d1.getFullYear()) * 12;
        months -= d1.getMonth();
        months += d2.getMonth();
        return months <= 0 ? 0 : months;
    }
    //function from string-similarity-js
    //since i was having import issues
    var stringSimilarity = function (str1, str2, substringLength, caseSensitive) {
        if (substringLength === void 0) { substringLength = 2; }
        if (caseSensitive === void 0) { caseSensitive = false; }
        if (!caseSensitive) {
            str1 = str1.toLowerCase();
            str2 = str2.toLowerCase();
        }
        if (str1.length < substringLength || str2.length < substringLength)
            return 0;
        var map = new Map();
        for (var i = 0; i < str1.length - (substringLength - 1); i++) {
            var substr1 = str1.substr(i, substringLength);
            map.set(substr1, map.has(substr1) ? map.get(substr1) + 1 : 1);
        }
        var match = 0;
        for (var j = 0; j < str2.length - (substringLength - 1); j++) {
            var substr2 = str2.substr(j, substringLength);
            var count = map.has(substr2) ? map.get(substr2) : 0;
            if (count > 0) {
                map.set(substr2, count - 1);
                match++;
            }
        }
        return (match * 2) / (str1.length + str2.length - ((substringLength - 1) * 2));
    };
    function passageSimilarity(passage, source){
        if(passage.lang == source.lang){
            if(passage.lang == 'rich'){
                return stringSimilarity(passage.content, source.content);
            }
            else if(passage.lang == 'mixed'){
                return stringSimilarity(passage.html + passage.css + passage.javascript, source.html + source.css + source.javascript);
            }
            else{
                return stringSimilarity(passage.code, source.code);
            }
        }
    }
    async function getLastSource(passage){
        var source = await Passage.findOne({_id:passage.sourceList.at(-1)});
        return source;
    }
    async function addStarsToUser(user, amount, _session){
        if(user.borrowedStars > 0){
            user.borrowedStars -= amount;
            var remainder = user.borrowedStars;
            if(remainder < 0){
                user.stars -= remainder;
            }
            if(user.borrowedStars < 0){
                user.borrowedStars = 0;
            }
        }else{
            user.stars += amount;
        }
        await user.save({session: _session});
    }
    async function starPassage(req, amount, passageID, userID, deplete=true, single=false, initialSession=null){
        let _session = initialSession;
        let shouldEndSession = false; // Flag to indicate if THIS call started the session
        if (_session === null) { // Check if a session was not passed in
            _session = await mongoose.startSession(); // Assign to the outer 'let' variable
            shouldEndSession = true; // This instance of starPassage is responsible for ending the session
        }
        try{
            let passageResult = null;
            
            // Define the transaction logic as a separate function
            const transactionLogic = async () => {
                let user = await User.findOne({_id: userID}).session(_session);
                if(isNaN(amount) || amount == 0){
                    passageResult = 'Please enter a number greater than 0.';
                    return;
                }
                var starsTakenAway = 0;
                if(deplete){
                    // Check if user has enough total stars (skip check if single)
                    if(((user.stars + user.borrowedStars + user.donationStars) < amount) && !single){
                        passageResult = "Not enough stars.";
                        return passageResult;
                    }
                    
                    var remainder = amount;
                    
                    // First, spend borrowed stars
                    if(user.borrowedStars > 0){
                        var borrowedUsed = Math.min(user.borrowedStars, remainder);
                        user.borrowedStars -= borrowedUsed;
                        remainder -= borrowedUsed;
                    }
                    
                    // If there's still remainder, spend from user.stars or donationStars
                    if(remainder > 0){
                        if(user.stars > 0){
                            // Take from user.stars first (can go to 0 or negative)
                            var starsUsed = Math.min(user.stars, remainder);
                            user.stars -= starsUsed;
                            starsTakenAway += starsUsed;
                            remainder -= starsUsed;
                            
                            // If still remainder and user.stars is now 0, take from donationStars
                            if(remainder > 0 && user.donationStars > 0){
                                var donationUsed = Math.min(user.donationStars, remainder);
                                user.donationStars -= donationUsed;
                                remainder -= donationUsed;
                            }
                            
                            // Any final remainder goes to user.stars (making it negative)
                            if(remainder > 0){
                                user.stars -= remainder;
                                starsTakenAway += remainder;
                            }
                        } else {
                            // user.stars is 0 or negative, take from donationStars first
                            if(user.donationStars > 0){
                                var donationUsed = Math.min(user.donationStars, remainder);
                                user.donationStars -= donationUsed;
                                remainder -= donationUsed;
                            }
                            
                            // Any remainder after donation stars should be taken from user.stars
                            if(remainder > 0){
                                user.stars -= remainder;
                                starsTakenAway = remainder;
                            }
                        }
                    }
                }
                let passage = await Passage.findOne({_id: passageID}).populate('author sourceList').session(_session);
                var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
                //Give starring user stars for each logged stars at 1% rate
                var loggedStars = await Star.find({passage:passage._id, single: false}).populate('user passage sources').session(_session);
                var totalForStarrer = 0;
                for(const loggedStar of loggedStars){
                    var starrer = loggedStar.user;
                    var sourceLog = [];
                    if(req.session.user._id.toString() != starrer._id.toString()){
                        totalForStarrer = 0.01 * loggedStar.amount * amount;
                        console.log('root, '+starrer.name + ' made ' + totalForStarrer + ' stars!');
                    }
                    // console.log("Logged sources: " + loggedStar.sources);
                    for(const source of loggedStar.sources){
                        //if the author of the passage is not the one who did the starring
                        // console.log(source.author._id.toString() != starrer._id.toString());
                        //only give each starrer each source one time &&
                        //a starrer will not get back stars from their own passages &&
                        //you dont get stars back when starring a passage, only when others star it
                        if(!sourceLog.includes(source) && 
                            source.author._id.toString() != starrer._id.toString() && 
                            req.session.user._id.toString() != starrer._id.toString()){
                            console.log("working, " + starrer.name);
                            //give the starrer 1% of each entry
                            let subtotal = 0.01 * loggedStar.amount * amount;
                            totalForStarrer += subtotal;
                            console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                        }
                        sourceLog.push(source);
                    }
                    // console.log(starrer.name + ' made ' + totalForStarrer + ' stars!');
                    await addStarsToUser(starrer, totalForStarrer, _session);
                }
                var lastSource = await getLastSource(passage);
                var bonus = 0;
                //calculate bonus
                // for(const source of passage.sourceList){
                //     if(passage.author._id.toString() != source.author._id.toString()){
                //         var similarity = passageSimilarity(passage, source);
                //         bonus += similarity > 0.1 ? similarity : 0;
                //     }
                // }
                bonus = bonus * amount;
                //log the amount starred
                let loggedStarDebt = req.session.user._id.toString() == passage.author._id.toString() ? 0 : (amount + bonus);
                await Star.create([{
                    user: userID,
                    passage: passage._id,
                    passageAuthor: passage.author._id.toString(),
                    amount: amount,
                    sources: sources,
                    single: false,
                    debt: loggedStarDebt,
                    fromSingle: single,
                    system: null //not relevant since we cant unstar these so just make it null
                }], {session: _session}); 
                // if(lastSource != null){
                //     bonus = passageSimilarity(passage, lastSource);
                // }else{
                //     bonus = 0;
                // }
                // if(lastSource && lastSource.author._id.toString() == req.session.user._id.toString()){
                //     bonus = 0;
                // }
                //add stars to passage and sources
                passage.stars += amount + bonus;
                console.log("BONUS:"+bonus);
                passage.verifiedStars += amount + bonus;
                passage.lastCap = passage.verifiedStars;
                //if bubbling star all sub passages (content is displayed in parent)
                if(passage.bubbling && passage.passages && !passage.public){
                    for(const p of passage.passages){
                        //also star sources for each sub passage
                        passage.sourceList = [...passage.sourceList, ...p.sourceList];
                        await starPassage(req, amount, p._id, userID, false, single, _session);
                    }
                }
                await starMessages(passage._id, amount);
                //each collaber inherits star debt from starrer (session user)
                var starrerDebt = await Star.find({
                    passageAuthor: req.session.user._id.toString(),
                    single: false,
                    debt: {$gt:0}
                });
                //absorb amount of stars that goes to author and collaborators
                //depending on "star debt"
                //get stars given to the starrer by these collaborators
                var allCollaborators = [passage.author, ...passage.collaborators];
                var amountToGiveCollabers = (amount + bonus)/(passage.collaborators.length + 1);
                collaboratorsLoop:
                for(const collaber of allCollaborators){
                    //only inherit debt, subtract debt, and create debt if we are actually starring the collaber
                    //you have to star someone elses passage to get stars
                    if(passage.author._id.toString() != req.session.user._id.toString() && !passage.collaborators.includes(req.session.user._id.toString())){
                        //get all debt owed by session user to specific collaber
                        var stars  = await Star.find({
                            //they got starred by collaber
                            passageAuthor: req.session.user._id.toString(), //(owes the debt)
                            user: collaber._id.toString(), //they starred session user
                            single: false,
                            debt: {$gt:0}
                        }).session(_session);
                        for(const star of stars){
                            //filter out all old debt that was already added to this collaber in a previous starPassage()
                            //before adding new debt
                            starrerDebt = starrerDebt.filter(function(x){
                                //this item comes from debt already added
                                return x.trackToken != star.trackToken;
                            });
                            //reduce the amount we're giving collabers by the amount owed
                            amountToGiveCollabers -= star.debt;
                            star.debt -= (amount + bonus)/(passage.collaborators.length + 1);
                            if(star.debt <= 0){
                                star.debt = 0;
                                await star.save({_session});
                                //they paid off this debt so continue to the next one
                                continue;
                            }else{
                                //amountToGiveCollaborators should be <= 0
                                await star.save({_session});
                                //they cant pay off their debt so stop
                                //trying to pay it
                                break collaboratorsLoop;
                            }
                        }
                        //each collaber inherits star debt from starrer
                        //this is so that the collaber has to pay off the debt before they can pay the debt.user
                        for(const debt of starrerDebt){
                            //create debt owed by collaber to starrer
                            await Star.create([{
                                passageAuthor: collaber._id.toString(), //owes the debt
                                user: debt.user._id.toString(), //to this user in the circle
                                single: false,
                                debt: debt.debt,
                                system: null,
                                passage: passage._id, //might not need this
                                sources: sources, //might not need this
                                trackToken: debt.trackToken
                            }], {session: _session});
                        }
                    }
                    if(amountToGiveCollabers < 0){
                        amountToGiveCollabers = 0;
                    }
                    if(!single){
                        user.starsGiven += starsTakenAway;
                    }
                    const SYSTEM = await System.findOne({}).session(_session);
                    if (!SYSTEM) {
                        throw new Error('System document not found.');
                    }
                    if(deplete){
                        //only add to starsgiven count if they cant be associated with a user
                        //thus deplete must be true because single stars don't add to starsGiven
                        SYSTEM.totalStarsGiven += amount;
                        await SYSTEM.save({_session});
                    }
                    // passage.author.stars += amountToGiveCollabers;
                    await addStarsToUser(passage.author, amountToGiveCollabers, _session);
                    //give stars to collaborators if applicable
                    //split stars with collaborators
                    if(passage.collaborators.length > 0){
                        for(const collaborator in passage.collaborators){
                            if(collaborator._id.toString() == passage.author._id.toString()){
                                //we already starred the author
                                continue;
                            }
                            let collaber = await User.findOne({_id:collaborator._id.toString()}).session(_session);
                            if(collaber != null){
                                // collaber.stars += amountToGiveCollabers;
                                await addStarsToUser(collaber, amountToGiveCollabers, _session);
                                // await collaber.save();
                            }
                        }
                    }
                    // await passage.author.save();
                }
                await user.save({_session});
                await passage.save({_session});
                //star each source
                var i = 0;
                var authors = [];
                //add sources for best,bestof,and mirror
                if(passage.showBestOf){
                    var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('parent author users sourceList collaborators versions subforums');;
                    if(best != null){
                        passage.sourceList.push(best);
                    }
                }
                else{
                    try{
                        var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums');
                        if(mirror != null)
                        passage.sourceList.push(mirror);
                    }
                    catch(e){
                    }
                    try{
                        var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums');
                        if(bestOf != null)
                            passage.sourceList.push(bestOf);
                    }
                    catch(e){
                    }
                }
                //recursively star sources
                await starSources(passage, passage, [], [], amount, req, _session);
                passageResult = await fillUsedInListSingle(passage); 
            };
            
            // Execute transaction logic - use withTransaction only if we created the session
            if (shouldEndSession) {
                // We created the session, so we need to manage the transaction
                await _session.withTransaction(transactionLogic);
            } else {
                // Session was passed in, so we're already in a transaction
                await transactionLogic();
            }
            
            console.log("starPassage transaction result:", passageResult);
            return passageResult;
        }
        catch(err){
            console.log("starPassage error:", err);
            console.log("err passageID"+passageID);
            console.error('Transaction failed after retries or due to a non-transient error:', err);
            return null; // Return null instead of undefined on error
        }
        finally {
            if (shouldEndSession) { // Only end the session if *this* function call initiated it
                _session.endSession();
            }
        }
    }
    function overlaps(arr1, arr2) {
      if (!arr1.length || !arr2.length) {
        return false; // Handle empty arrays
      }
      const set1 = new Set(arr1);
      return arr2.some(element => set1.has(element));
    }
    async function starSources(passage, top, authors=[], starredPassages=[], amount, req, _session){
        var i = 0;
        var bonus;
        for(const source of passage.sourceList){
            var sourcePop = await Passage.findOne({_id:source._id}).populate('author users sourceList').session(_session);
            //dont restar top passage
            if(sourcePop._id.toString() !== top._id.toString()){
                //don't star same passage twice
                if(!starredPassages.includes(sourcePop._id.toString())){
                    await starMessages(sourcePop._id, amount);
                    // console.log(passage.sourceList);
                    let sourceAuthor = await User.findOne({_id: sourcePop.author._id}).session(_session);
                    //you won't get extra stars for citing your own work
                    //also give author stars once per author
                    if(sourceAuthor._id.toString() != req.session.user._id.toString() 
                        && sourceAuthor._id.toString() != passage.author._id.toString()
                        && !sourcePop.collaborators.toString().includes(passage.author._id.toString()
                        && !overlaps(sourcePop.collaborators, passage.collaborators))
                        /*&& !authors.includes(sourceAuthor._id)*/){
                        bonus = passageSimilarity(top, sourcePop);
                        bonus = 0; //bonuses are to reward users for citing
                        sourcePop.stars += amount + bonus;
                        //dont give author stars if starrer is a collaborator
                        if(!sourcePop.collaborators.includes(req.session.user._id.toString())){
                            if(!authors.includes(sourceAuthor._id.toString())){
                                await addStarsToUser(sourceAuthor, (amount + bonus/(sourcePop.collaborators.length + 1)), _session);
                            }
                        }
                        authors.push(sourceAuthor._id.toString());
                        for(const collaber of sourcePop.collaborators){
                            authors.push(collaber._id.toString());
                        }
                        await sourcePop.save({_session});
                        //dont give collaborators stars if starrer is a collaborator
                        if(!sourcePop.collaborators.includes(req.session.user._id.toString())){
                            //give stars to collaborators if applicable
                            //split stars with collaborators
                            if(sourcePop.collaborators.length > 0){
                                for(const collaborator in sourcePop.collaborators){
                                    if(collaborator._id.toString() == passage.author._id.toString()){
                                        //we already starred the author
                                        continue;
                                    }
                                    let collaber = await User.findOne({_id:collaborator._id.toString()}).session(_session);
                                    if(collaber != null){
                                        await addStarsToUser(collaber, ((amount + bonus)/(sourcePop.collaborators.length + 1)), _session);
                                    }
                                }
                            }   
                        }
                    }
                    starredPassages.push(sourcePop._id.toString());
                }
                if(sourcePop._id.toString() !== top._id.toString()){
                    await starSources(sourcePop, passage, authors, starredPassages, amount, req, _session);
                }else{
                    console.log("circular");
                }
                ++i;
            }
        }
    }
    async function starMessages(passage, stars=1){
        //keep message stars aligned with passage
        var messages = await Message.find({passage: passage});
        for(const message of messages){
            message.stars += stars;
            await message.save();
        }
    }
    async function notifyUser(userId, content, type="General"){
        let notification = await Notification.create({
            user: userId,
            content: content,
            type: type
        });
    }
    //basically messages
    async function sharePassage(from, _id, username){
        var user = await User.findOne({
            username: username
        });
        var passage = await Passage.findOne({
            _id: _id
        });
        if(user != null){
            var message = await Message.create({
                from: from,
                to: user._id,
                passage: _id,
                title: passage.title
            });
            return 'Message Sent';
        }
        return 'User not Found.';
    }
    app.post('/share_passage', async(req, res) => {
        res.send(await sharePassage(req.session.user._id, req.body.passageId, req.body.username));
    });
    app.get('/messages', async(req, res) => {
        //paginate messages
        //...TODO

        //serve messages
        //sort them by stars
        var messages = await Message.find({
            to: req.session.user._id,
            passage: {
                $ne: null
            }
        }).populate('passage').sort({stars:-1, _id:-1}).limit(DOCS_PER_PAGE);
        messages = messages.filter(function(x){
            return x.passage != null;
        });
        var passages = [];
        for(const message of messages){
            var p = await Passage.findOne({
                _id: message.passage._id
            }).populate('author users sourcelist collaborators versions');
            passages.push(p);
        }
        for(var i = 0; i < passages.length; ++i){
            passages[i] = await getPassage(passage);
        }

        let bookmarks = [];
            // if(req.session.user){
            //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
            // }
            if(req.session.user){
                bookmarks = getBookmarks(req.session.user);
            }
        passages = await fillUsedInList(passages);
        res.render('messages', {
            passages: passages,
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            page: 1,
            bookmarks: bookmarks,
        });
    });
    //get highest rank passage with title
    async function bestOf(title){
        return await Passage.find({title:title, personal: false, simulated: false}).sort('-stars').limit(1)[0];
    }
    //get best passage in best module for passage
    //hard to tell the difference from the above function
    //still thinking about it...
    //but this is better (more useful), I think...
    async function bestOfPassage(title){
        var parent = await Passage.find({title:title, public: true, personal: false, simulated: false}).sort('-stars').limit(1)[0];
        if(parent != null){
            var sub = await Passage.find({parent: parent._id, personal: false, simulated: false}).sort('-stars').limit(1);
            return sub;
        }
        return 'No public passage "' + title + '"';
    }
    app.get('/bestOf/:title', async(req, res) => {
        res.send(await bestOfPassage(req.params.title));
    });
    //ROUTES
    app.get('/personal/:user_id', async (req, res) => {
        if(!req.session.user || req.session.user._id != req.params.user_id){
            return res.redirect('/');
        }
        else{
            var passages = await Passage.find({
                //author: req.params.user_id, 
                personal: true,
                users: {
                    $in: [req.params.user_id]
                }
            }).populate('author users sourcelist collaborators versions parent').limit(DOCS_PER_PAGE);
            for(var i = 0; i < passages.length; ++i){
                passages[i] = await getPassage(passages[i]);
            }
            let bookmarks = [];
            // if(req.session.user){
            //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
            // }
            if(req.session.user){
                bookmarks = getBookmarks(req.session.user);
            }
            passages = await fillUsedInList(passages);
            const ISMOBILE = browser(req.headers['user-agent']).mobile;
            return res.render("stream", {
                subPassages: false,
                passageTitle: false, 
                scripts: scripts, 
                passages: passages, 
                page: 'personal',
                passage: {id:'root', author: {
                    _id: 'root',
                    username: 'Sasame'
                }},
                bookmarks: bookmarks,
                ISMOBILE: ISMOBILE,
                whichPage: 'personal'
            });
        }
    });

    //GET (or show view)
    app.get("/profile/:username?/:_id?/", async (req, res) => {
        let bookmarks = [];
        let profile;
        if(typeof req.params.username == 'undefined' || !req.params._id){
            if(!req.session.user){
                return res.redirect('/');
            }
            profile = req.session.user;
        }
        else{
            profile = await User.findOne({_id: req.params._id});
            console.log("TEST:"+profile.rank);
        }
        if(profile == null){
            return res.redirect('/');
        }
        let find = {
            //author: profile, 
            users: {
                $in: [profile]
            },
            deleted: false, 
            personal: false,
            versionOf: null
        };
        //if it's their profile show personal passages
        // if(req.session.user && profile._id.toString() == req.session.user._id.toString()){
        //     find.$or = [{personal: true}, {personal: false}];
        // }
        let passages = await Passage.find(find).populate('author users sourceList collaborators versions').sort({stars: -1, _id: -1}).limit(DOCS_PER_PAGE);
        for(var i = 0; i < passages.length; ++i){
            passages[i] = await getPassage(passages[i]);
        }
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('passages').passages;
        // }
        if(req.session.user){
            bookmarks = getBookmarks(req.session.user);
        }
        var usd = 0;
        const SYSTEM = await System.findOne({});
        // usd = parseInt((await percentStarsGiven(profile.starsGiven)) * (await scripts.getMaxToGiveOut()));
        let systemStarsGiven = SYSTEM.totalStarsGiven;
        console.log(profile.starsGiven);
        console.log("SYSTEMSTARS:"+systemStarsGiven);
        console.log("SYSTEMMAX:"+(await scripts.getMaxToGiveOut()));
        usd = (profile.starsGiven/systemStarsGiven) * (await scripts.getMaxToGiveOut());
        console.log(parseInt(parseInt(profile.starsGiven)/parseInt(systemStarsGiven)));
        console.log(profile.starsGiven/systemStarsGiven);
        if(isNaN(usd)){
            usd = 0;
        }
        passages = await fillUsedInList(passages);
        var following;
        if(req.session.user){
            var follower = await Follower.findOne({
                user: req.session.user._id,
                following: profile._id
            });
        }
        else{
            var follower = null;
        }
        if(follower == null){
            var followings = await Follower.find({});
            console.log(followings);
            console.log("Not Following");
            following = false;
        }
        else{
            following = true;
        }
        usd = usd == 0 ? 0 : usd/100;
        if(isNaN(usd)){
            usd = 0;
        }
        res.render("profile", {usd: parseInt(usd), subPassages: false, passages: passages, scripts: scripts, profile: profile,
        bookmarks: bookmarks,
        whichPage: 'profile',
        page: 1,
        thread: false,
        following: following,
        passage: {id:'root', author: {
                    _id: 'root',
                    username: 'Sasame'
                }}
        });
    });
    app.post('/follow', async (req, res) => {
        var isFollowing = await Follower.findOne({
            user: req.session.user,
            following: req.body.who
        });
        if(isFollowing == null){
            var following = await Follower.create({
                user: req.session.user,
                following: req.body.who
            });
            return res.send("Followed.");
        }
        else{
            await Follower.deleteOne({
            user: req.session.user,
            following: req.body.who
        });
        }
        return res.send("Unfollowed");
    });
    app.get('/notifications', async (req, res) => {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        if(!req.session.user){
            return res.redirect('/');
        }
        var notifications = await Notification.find({
            for: req.session.user
        }).sort({_id: -1}).limit(20);
        if(req.session.user){
            var bookmarks = getBookmarks(req.session.user);
        }
        return res.render('notifications', {
                subPassages: false,
                passageTitle: false, 
                scripts: scripts, 
                passages: [], 
                passage: {id:'root', author: {
                    _id: 'root',
                    username: 'Sasame'
                }},
                bookmarks: bookmarks,
                ISMOBILE: ISMOBILE,
                page: 'more',
                whichPage: 'notifications',
                notifications: notifications
            });
    });
    app.post('/get_username_number', async function(req, res){
        let name = req.body.name;
        let number = await User.countDocuments({name:name.trim()}) + 1;
        res.send(number + '');
    });
    //HOME/INDEX
    app.get('/rex_login', async (req, res) => {
        res.render('rex_login');
    });
    async function getFullPassage(_id){
        //get fully populated passage as JSON
        var passage = await Passage.findOne({_id: _id});
    }
    async function alternate(passageID, iteration, prevs){
        console.log(iteration);
        var passage = await Passage.findOne({_id: passageID});
        var find = {
            title: passage.title,
            _id: {
                $ne: passage._id
            }
        };
        var numDocuments = await Passage.countDocuments(find);
        if(iteration >= numDocuments){
            return false;
        }
        var test = await Passage.find(find);
        var alternate = await Passage.find(find).sort('-stars').populate('author users sourceList collaborators versions').skip(parseInt(iteration)).limit(1);
        alternate = alternate[0];

        return alternate;
    }
    app.get('/alternate', async(req, res) => {
        //UPDATE TODO
        //Okay, so, we need to get the _id of the parent passage
        //then splice/replace in the alternate passage
        //and then return the whole deal :)
        //\UPDATE TODO
        var parent = await Passage.findOne({_id: req.query.parentID}).populate('author users sourceList');
        var passage = await alternate(req.query.passageID, req.query.iteration, req.query.altPrevs);
        if(!passage){
            return res.send("restart");
        }
        console.log('?' + passage.content);
        //return sub false rendered view of parent
        //...
        //I know and sorry this is a lot of duplicated code from passage view route
        //but TODO will see if we can put all this into a function
        var subPassages = await Passage.find({parent: parent._id, personal: false}).populate('author users sourceList collaborators versions');
        //reorder sub passages to match order of passage.passages
        var reordered = Array(subPassages.length).fill(0);
        for(var i = 0; i < parent.passages.length; ++i){
            for(var j = 0; j < subPassages.length; ++j){
                if(subPassages[j]._id.toString() == parent.passages[i]._id.toString()){
                    reordered[i] = subPassages[j];
                }
            }
        }
        //idk why but sometimes in production there were extra 0s...
        //need to test more and bugfix algorithm above
        reordered = reordered.filter(x => x !== 0); //just get rid of extra 0s
        if(parent.passages.length < 1){
            reordered = subPassages;
        }
        parent.passages = reordered;
        // if(parent._id.toString() == req.query.passageID){
        //     parent = passage[0];
        // }
        // else{
            // parent.passages.forEach(function(p, i){
            //     if(i == req.query.position){
            //         parent.passages[i] = passage;
            //     }
            // });
            var i = 0;
            for(const p of parent.passages){
                if(i == req.query.position){
                    let processedPassage = await getPassage(passage);
                    if (!processedPassage.usedIn) {
                        processedPassage.usedIn = [];
                    }
                    parent.passages[i] = processedPassage;
                }
                ++i;
            }
        // }
        // if(typeof parent.passages != 'undefined' && parent.passages[0] != null){
        //     for(const p of parent.passages){
        //         parent.passages[p] = bubbleUpAll(p);
        //     }
        // }
        parent = await getPassage(parent);
        console.log("SourceList:"+parent.originalSourceList.length);
        // parent.originalSourceList = [];
        if(parent.displayHTML.length > 0 || parent.displayCSS.length > 0 || parent.displayJavascript.length > 0){
            parent.showIframe = true;
        }
        if(passage){
            return res.render('passage', {
                subPassages: parent.passages,
                passage: parent,
                sub: false,
                subPassage: true,
                altIteration: '_' + req.query.iteration
            });
        }
        else{
            return res.send('restart');
        }
    });
    app.post('/save_alternate', async(req, res) => {
        var original = await Passage.findOne({_id: req.body.passageID});
        var passage = await passageController.copyPassage(original, [req.session.user], null, async function(){

        });
        passage.passages = [];
        for(const p of JSON.parse(req.body.passages)){
            var full = await Passage.findOne({_id:p});
            var newPassage = await passageController.copyPassage(full, [req.session.user], null, async function(){

            });
            newPassage.parent = passage;
            await newPassage.save();
            passage.passages.push(newPassage);
        }
        await passage.save();
        await bookmarkPassage(passage, req.session.user._id);
        return res.send("Bookmarked Alternate Module.");
    });
    // function getFromRemote(url){
    //     var request = https.request(remoteURL, function(response){
    //         response.setEncoding('utf8');
    //         response.on('data', function(data){
    //             var final = data.replaceAll("/css/", "https://infinity-forum.org/css/");
    //             var final = data.replaceAll("/js/", "https://infinity-forum.org/js/");
    //             var final = data.replaceAll("/images/", "https://infinity-forum.org/images/");
    //             return res.send(final);
    //         });
    //     });
    //     request.end();
    // }


    /**
     * Save associated files,
     * Add novel sourceLink for pushed/pulled passages
     */
    if(process.env.LOCAL == 'true'){
        //send a passsage from local sasame to remote
        app.post('/push', async (req, res) => {
            const fsp = require('fs').promises;
            var passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList collaborators versions');

              var url = 'https://infinity-forum.org/pull';
              //TODO add file
              var file = await fsp.readFile('./dist/uploads/' + passage.filename, "base64");
              var data = querystring.stringify({
                passage : JSON.stringify(passage),
                file: file
            });
              var options = {
                  hostname: 'infinity-forum.org',
                  path: '/pull',
                  method: 'POST',
                  thumbnail: '',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(data)
                  }
              }
              
              var request = https.request(options, function (response) {
                // done
                console.log('statusCode:', res.statusCode);
                console.log('headers:', res.headers);
                response.setEncoding('utf8');
                var fin = '';
                response.on('data', (d) => {
                    fin += d;
                    console.log("body: " + d);
                });
                response.on('end', function(){
                    res.send(fin);
                });
              });
              request.on('error', (e) => {
                console.error(e);
              });  
              console.log(data);        
              request.write(data);
              request.end();
        });
    }
    //recieve a passage from remote
    app.post('/pull', async (req, res) => {
        const fsp = require('fs').promises;
        //all pulled passages start off at root level
        //copy passage
        var passage = JSON.parse(req.body.passage);
        var uploadTitle = v4();
        passage.sourceList = [];
        passage.sourceLink = process.env.DOMAIN + '/' + encodeURIComponent(passage.title) + '/' + passage._id;
        var pushingAuthor = await User.findOne({email: passage.author.email}) || req.session.user;
        //TODO: modify copy to ensure thumbnail creation onload
        //...
        //local is recieving a passage from a remote sasame
        //associate proper file
        if(process.env.LOCAL == 'true'){
            var copy = await passageController.copyPassage(passage, [pushingAuthor || req.session.user], null, function(){

            });
            //bookmark passage
            await bookmarkPassage(copy._id, pushingAuthor._id);
            if(passage.filename){
                uploadTitle = uploadTitle + passage.filename.split('.').at(-1);
            }
            copy.filename = uploadTitle;
            await copy.save();
            //file from passage 

            const file = await fs.createWriteStream('./dist/uploads/' + uploadTitle);
            const request = https.get('https://infinity-forum.org/uploads/' + passage.filename, function(response){
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                });
            });
            return res.redirect('/');
        }
        //remote is recieving passage from a local sasame
        else if(process.env.REMOTE == 'true'){
            var user = await authenticateUsername(passage.author.email, req.body.password);
            if(user){
                var copy = await passageController.copyPassage(passage, [pushingAuthor || req.session.user], null, function(){

                });
                //bookmark passage
                await bookmarkPassage(copy._id, pushingAuthor._id);
                copy.sourceLink = null;
                copy.collaborators.push(copy.author.email);
                //file from form sent by requests module
                //(local sasame may not have public URL)
                //upload main file
                copy.filename = uploadTitle;
                await copy.save();
                var buf = Buffer.from(req.body.file, 'base64');
                await fsp.writeFile('./dist/uploads/'+uploadTitle, buf);
                return res.send('https://infinity-forum.org/passage/' + encodeURIComponent(copy.title) + '/' + copy._id);
            }
            else{
                return res.send("Wrong Credentials.");
            }
        }
    });


    //use email to assign transferred (push or pull) passage to the correct author for merit
    function updateTransferredPassageAuthor(){

    }

    app.get('/get_passage', async (req, res) => {
        //run authentication for personal passages
        var passage = await Passage.findOne({_id: req.query._id})
        if(!passage.personal || (passage.personal && req.session.user._id.toString() == passage.author._id.toString())){
            return res.send(JSON.stringify(passage));
        }
        else{
            return res.send('Improper Credentials.');
        }
    });
    app.post('/passage_from_json', async (req, res) => {
        //copy passage
        var copy = passageController.copyPassage(req.params.passage, [req.session.user], null, function(){
            
        });
        await bookmarkPassage(copy._id, req.session.user._id);
    });
    function getRemotePage(req, res){
        //get same route from server
        var route = req.originalUrl + '?fromOtro=true';
        const remoteURL = 'https://infinity-forum.org' + route;
        var output = '';
        var request = https.request(remoteURL, function(response){
            response.setEncoding('utf8');
            response.on('data', function(data){
                var final = data.replaceAll("/css/", "https://infinity-forum.org/css/");
                final = final.replaceAll("/js/", "https://infinity-forum.org/js/");
                final = final.replaceAll("/eval/", "https://infinity-forum.org/eval/");
                final = final.replaceAll("/images/", "https://infinity-forum.org/images/");
                final = final.replaceAll("/jquery", "https://infinity-forum.org/jquery");
                final = final.replaceAll("https://unpkg.com/three@0.87.1/exampleshttps://infinity-forum.org/js/loaders/GLTFLoader.js", "https://unpkg.com/three@0.87.1/examples/js/loaders/GLTFLoader.js");
                final = final.replaceAll("/ionicons.esm.js", "https://infinity-forum.org/ionicons.esm.js");
                final = final.replaceAll("/ionicons.js", "https://infinity-forum.org/ionicons.js");
                output += final;
            });
            response.on('end', function(){
                var script = `
                <script>
                    $(function(){
                        var html = '<ion-icon data-cesconnect="true"style="float:left;"class="green"id="remote_toggle"title="Remote"src="/images/ionicons/sync-circle.svg"></ion-icon>';
                        $(document).on('click', '#remote_toggle', function(){
                            //green
                            if($(this).css('color') == 'rgb(0, 128, 0)'){
                                $(this).css('color', 'red');
                                $.ajax({
                                    type: 'post',
                                    url: '/cesconnect/',
                                    data: {},
                                    success: function(data){
                                        window.location.reload();
                                    }
                                });
                            }
                            else{
                                $(this).css('color', 'rgb(0, 128, 0)');
                                $.ajax({
                                    type: 'post',
                                    url: '/cesconnect/',
                                    data: {},
                                    success: function(data){
                                        window.location.reload();
                                    }
                                });
                            }
                        });
                        $('#main_header').prepend(html);
                        $(document).on('click', '[id^="passage_pull_"]', function(e){
                            var _id = $(this).attr('id').split('_').at(-1);
                            //submit proper form
                            $('#pull_form_' + _id).submit();
                            flashIcon($('#passage_pull_' + _id), 'green');
                        });
                        $(document).on('click', '.rex_cite', function(){
                            var _id = ''; //get from DOM
                            //1. Get passage from remote
                            $.ajax({
                                type: 'get',
                                url: 'https://christianengineeringsolutions/get_passage',
                                data: {
                                    _id: _id,
                                },
                                success: function(data){
                                    flashIcon($('#transfer_bookmark_' + _id), 'green');
                                    $('#passage_wrapper').append(data);
                                    //2. update details to local
                                    $.ajax({
                                        type: 'post',
                                        url: '/passage_from_json',
                                        data: {
                                            passage: data,
                                        },
                                        //this route should also bookmark the passage
                                        success: function(data){
                                           //show some success alert
                                           alert("Done"); //temp
        
                                        }
                                    });


                                }
                            });

                        });
                    });
                </script>
                `;
                return res.send(output + script);
            });
        });
        request.end();
    }
    app.post('/cesconnect', function(req, res){
        req.session.CESCONNECT = !req.session.CESCONNECT;
        res.send("Done.");
    });
    async function fillUsedInListSingle(passage){
            passage.usedIn = [];
            var ps = await Passage.find({
                sourceList: {
                    $in: [passage._id]
                },
                versionOf: null
            });
            for(const p of ps){
                var record = await Passage.findOne({_id: p._id});
                passage.usedIn.push('<a href="/passage/'+record.title+'/'+record._id+'">'+record.title+'</a>');
            }
        return passage;
    }
    async function fillUsedInList(passages){
        if(passages.length > 0)
        for(const passage of passages){
            passage.usedIn = [];
            var ps = await Passage.find({
                sourceList: {
                    $in: [passage._id]
                },
                versionOf: null
            });
            for(const p of ps){
                var record = await Passage.findOne({_id: p._id});
                passage.usedIn.push('<a href="/passage/'+record.title+'/'+record._id+'">'+record.title+'</a>');
            }
        }
        return passages;
    }
    // async function fillUsedInList(passages) {
    //     if (!passages?.length) {
    //         return passages;
    //     }

    //     const passageIds = passages.map(passage => passage._id);
        
    //     // Fetch all related passages in a single query
    //     const relatedPassages = await Passage.find({
    //         sourceList: { $in: passageIds }
    //     }).select('_id title');

    //     // Create a map of source passages to their usage
    //     const usageMap = relatedPassages.reduce((acc, related) => {
    //         for (const sourceId of related.sourceList) {
    //             if (!acc[sourceId]) {
    //                 acc[sourceId] = [];
    //             }
    //             acc[sourceId].push({
    //                 id: related._id,
    //                 title: related.title
    //             });
    //         }
    //         return acc;
    //     }, {});

    //     // Update original passages with their usage information
    //     return passages.map(passage => ({
    //         ...passage,
    //         usedIn: (usageMap[passage._id] || []).map(usage => 
    //             `<a href="/passage/${encodeURIComponent(usage.title)}/${usage.id}">${usage.title}</a>`
    //         )
    //     }));
    // }
async function getPassageLocation(passage, train){
        train = train || [];
        // console.log(passage.parent);
        if(passage.parent == null){
            var word;
            if(!passage.public && !passage.forum){
                word = 'Projects';
            }
            else if(passage.public && !passage.forum){
                word = 'Tasks';
            }
            else if(passage.forum){
                word = 'Infinity Forum';
            }
            if(word != 'Infinity Forum'){
                console.log('IF');
                word = passage.label + 's';
            }
            if(passage.label == "Social"){
                word = 'Network'
            }
            console.log(word);
            train.push(word);
            return train.reverse();
        }
        else{
            var parent;
            // console.log(passage.parent);
            parent = await Passage.findOne({_id:passage.parent._id.toString()});
            // console.log(parent);
            if(parent == null){
                var word;
                if(!passage.public && !passage.forum){
                    word = 'Projects';
                }
                else if(passage.public && !passage.forum){
                    word = 'Tasks';
                }
                else if(passage.forum){
                    word = 'Infinity Forum';
                }
                train.push(word);
                return train.reverse();
            }
            // parent = passage.parent;
            train.push(parent.title == '' ? 'Untitled' : parent.title);
            return await getPassageLocation(parent, train);
        }
    }
    async function returnPassageLocation(passage){
        var location = (await getPassageLocation(passage)).join('/');
        // return passage.parent ? passage.parent.title + passage.parent.parent.title : '';
        return '<a style="word-wrap:break-word;"href="'+(passage.parent ? ('/passage/' + (passage.parent.title == '' ? 'Untitled' : encodeURIComponent(passage.parent.title)) + '/' + passage.parent._id) : '/posts') +'">' + location + '</a>';
    }
    async function modifyArrayAsync(array, asyncFn) {
      const promises = array.map(async (item) => {
        return await asyncFn(item);
      });

      return Promise.all(promises);
    }
    app.get('/posts', async (req, res) => {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
          const page = parseInt(req.query.page || '1');
          const limit = DOCS_PER_PAGE;
        if(req.session.CESCONNECT){
            getRemotePage(req, res);
        }
        else{
            try {
            // Generate feed for guest users
            const feedResult = await generateGuestFeed(page, limit);
            
            // Check if we need to redirect (e.g., page number is beyond available results)
            if (feedResult.redirect) {
              return res.redirect(`/discover?page=${feedResult.page}`);
            }
            
            // Process each passage to get complete data
            const passages = [];
            for (let i = 0; i < feedResult.feed.length; i++) {
              const processedPassage = await getPassage(feedResult.feed[i]);
              passages.push(processedPassage);
            }
            
            // Render the feed page
            return res.render("stream", {
              subPassages: false,
              passageTitle: false, 
              scripts: scripts, 
              passages: passages, 
              passage: {
                id: 'root', 
                author: {
                  _id: 'root',
                  username: 'Sasame'
                }
              },
              ISMOBILE: ISMOBILE,
              page: 'posts',
              whichPage: 'stream',
              thread: false,
              currentPage: feedResult.currentPage,
              totalPages: feedResult.totalPages
            });
          } catch (error) {
            console.error('Error generating guest feed:', error);
            return res.status(500).send('Error generating feed. Please try again later.');
          }
        }
    });
    //index.html
    app.get('/', async (req, res) => {
        //REX
        if(req.session.CESCONNECT){
            getRemotePage(req, res);
        }
        else{
            const isMobile = browser(req.headers['user-agent']).mobile;
            let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
            let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
            let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
            let golden = '';
            let addPassageAllowed = true;
            let addChapterAllowed = true;
            var user = req.session.user || null;
            let passages = await Passage.find({
                deleted: false,
                personal: false,
                simulated: false,
            }).populate('author users sourceList collaborators versions').sort({stars: -1, _id: -1}).limit(DOCS_PER_PAGE);
            for(var i = 0; i < passages.length; ++i){
                passages[i] = await getPassage(passages[i]);
            }
            let passageUsers = [];
            let bookmarks = [];
            // if(req.session.user){
            //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
            // }
            if(req.session.user){
                bookmarks = getBookmarks(req.session.user);
            }
            res.render("index", {
                subPassages: false,
                passageTitle: false, 
                scripts: scripts, 
                passages: passages, 
                passage: {id:'root', author: {
                    _id: 'root',
                    username: 'Sasame'
                }},
                bookmarks: bookmarks,
            });
        }
    });
    function sortArray(arr, to){
        var reordered = Array(arr.length).fill(0);
        for(var i = 0; i < to.length; ++i){
            for(var j = 0; j < arr.length; ++j){
                if(arr[j]._id.toString() == to[i]._id.toString()){
                    reordered[i] = arr[j];
                }
            }
        }
        reordered = reordered.filter(x => x !== 0);
        return reordered;
    }
    app.get('/forum', async (req, res) => {
        // await clearForum();
        // await fillForum(req);
        let bookmarks = [];
        if(req.session.user){
            bookmarks = getBookmarks(req.session.user);
        }
        var infinity = await Passage.findOne({forumType: 'header'});
        var categories = await Passage.find({forumType: 'category'});
        var subcats = await Passage.find({forumType: 'subcat'}).populate('passages.author');
        var subforums = await Passage.find({forumType: 'subforum'});
        //get categories and subofrums in order as sorted
        var header = await Passage.findOne({forumType: 'header'});
        categories = sortArray(categories, infinity.passages);
        categories = categories.filter(function(value, index, array){
            return (value.title == 'VIP' || value.title == 'Admins') ? false : true;
        });
        var sortedSubcats = [];
        //sort subcats
        //get list of all subcats in order from category passages
        for(const cat of categories){
            for(const c of cat.passages){
                sortedSubcats.push(c);
            }
        }
        subcats = sortArray(subcats, sortedSubcats);
        var sortedSubforums = [];
        //sort subforums
        //get list of all subforums in order from subcat passages
        for(const sub of subcats){
            for(const s of sub.subforums){
                sortedSubforums.push(s);
            }
        }
        subforums = sortArray(subforums, sortedSubforums);
        if(req.query._id){
            return res.render("forum_body", {
                scripts: scripts,
                bookmarks: bookmarks,
                categories: categories,
                subcats: subcats,
                subforums: subforums,
            });
        }
        res.render("forum", {
            scripts: scripts,
            bookmarks: bookmarks,
            categories: categories,
            subcats: subcats,
            subforums: subforums,
        });
        // await Subforum.deleteMany({});
        // fillForum();
    });
    async function getPassage(passage, small=true){
        console.log('test9');
        passage.originalSourceList = passage.sourceList.slice();
        // var passage = await Passage.findOne({_id: _id.toString()}).populate('parent author users sourceList subforums collaborators');
        if(passage == null){
            // return res.redirect('/');
            return null;
        }
        var mirror = null;
        var bestOf = null;
        var replacement = null; 
        var replacing = false;
        if(!passage.showBestOf){
            try{
                var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList subforums collaborators versions');
                passage.sourceList.push(mirror);
                // passage.special = await getPassage(mirror);
            }
            catch(e){
                var mirror = null;
            }
            try{
                var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList subforums collaborators versions');
                passage.sourceList.push(bestOf);
                // passage.special = await getPassage(bestOf);
            }
            catch(e){
                var bestOf = null;
            }
            var replacement = mirror == null ? bestOf : mirror;
            var replacing = false;
            replacement = bestOf == null ? mirror : bestOf;
            if(replacement != null){
                replacing = true;
            }
        }
        if(passage == null){
            return false;
        }
        passage.showIframe = false;
        // if(passage == null){
        //     return res.redirect('/');
        // }
        let passageUsers = [];
        if(passage.users != null && passage.users[0] != null){
            // passage.users.forEach(function(u){
            //     passageUsers.push(u._id.toString());
            // });
            for(const u of passage.users){
                passageUsers.push(u._id.toString());
            }
        }
        if(replacing){
            passage.passages = replacement.passages;
        }
        if(replacing && (passage.mirror != null || passage.bestOf != null)){
            passage.lang = replacement.lang;
            passage.content = replacement.content;
            passage.code = replacement.code;
            passage.html = replacement.html;
            passage.css = replacement.css;
            passage.javascript = replacement.javascript;
            passage.filename = replacement.filename;
            passage.mimeType = replacement.mimeType;
            passage.passages = replacement.passages;
            passage.bubbling = replacement.bubbling;
        }
        if(passage.mirrorEntire && passage.mirror != null && replacement != null){
            passage.title = replacement.title;
        }
        if(passage.bestOfEntire && replacement != null){
            passage.title = replacement.title;
        }
        if(replacing && passage.mirror != null){
            passage.isMirrored = true;
        }
        if(replacing && passage.bestOf != null){
            passage.isBestOf = true;
        }
        passage = await bubbleUpAll(passage);
        if(replacing){
        replacement = await bubbleUpAll(replacement);
        }
        if(passage.public == true && !passage.forum){
            
        }
        else{
            if(passage.displayHTML.length > 0 || passage.displayCSS.length > 0 || passage.displayJavascript.length > 0){
                passage.showIframe = true;
            }
            if(passage.forum){
            }
            else{ 
            }
        }
        if(passage.parent != null){
            var parentID = passage.parent._id;
        }
        else{
            var parentID = 'root';
        }
        passage = await fillUsedInListSingle(passage);
        // passage.location = 'test';
        passage.location = await returnPassageLocation(passage);
        // passage.location = 'Test';
        if(passage.showBestOf){
            //get best sub passage
            var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
            if(best != null){
                passage.bestSub = await getPassage(best);
                if(small){
                passage.sourceList.push(best);
                }
                passage.special = passage.bestSub;
                passage.special.isSpecial = true;
                passage.special.specialType = 'Best';
            }
            else{
                passage.bestSub = false;
            }
        }else{
            passage.bestSub = false;
        }
        if(passage.repost != null){
            //get best sub passage
            var repost = await Passage.findOne({_id:passage.repost});
            if(repost != null){
                passage.repostFixed = await getPassage(repost);
                passage.special = passage.repostFixed;
                passage.sourceList.push(repost);
                passage.special.isSpecial = true;
                passage.special.specialType = 'Reposted';
            }
            else{
                passage.repostFixed = false;
            }
        }else{
            passage.repostFixed = false;
        }
        passage.sourceList = await getRecursiveSourceList(passage.sourceList, [], passage);
        console.log('test10');
        return passage;
    }
    async function getBigPassage(req, res, params=false, subforums=false, comments=false){
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
        let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
        var passage_id = req.query._id;
        if(params){
            passage_id = req.params.passage_id;
        }
        var page = req.query.page || req.params.page || 1;
        var passage = await Passage.findOne({_id: passage_id.toString()}).populate('parent author users sourceList subforums collaborators versions mirror bestOf best');
        if(passage == null){
            return res.redirect('/');
        }
        if(passage.personal == true && !scripts.isPassageUser(req.session.user, passage)){
            return res.send(passage + "Must be on Userlist");
        }
        try{
            var mirror = await Passage.findOne({_id:passage.mirror._id});
            passage.sourceList.push(mirror);
        }
        catch(e){
            var mirror = null;
        }
        try{
            var bestOf = await Passage.findOne({parent:passage.bestOf._id}, null, {sort: {stars: -1}});
            passage.sourceList.push(bestOf);
        }
        catch(e){
            var bestOf = null;
        }
        // passage.sourceList = await getRecursiveSourceList(passage.sourceList, [], passage);
        var replacement = mirror == null ? bestOf : mirror;
        var replacing = false;
        replacement = bestOf == null ? mirror : bestOf;
        if(replacement != null){
            replacing = true;
        }
        if(passage == null){
            return false;
        }
        var totalDocuments = await Passage.countDocuments({
            parent: passage._id
        })
        console.log(totalDocuments);
        var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
        passage.showIframe = false;
        // if(passage == null){
        //     return res.redirect('/');
        // }
        let passageUsers = [];
        if(passage.users != null && passage.users[0] != null){
            // passage.users.forEach(function(u){
            //     passageUsers.push(u._id.toString());
            // });
            for(const u of passage.users){
                passageUsers.push(u._id.toString());
            }
        }
        if(replacing){
            passage.passages = replacement.passages;
        }
        if(replacing && (passage.mirror != null || passage.bestOf != null)){
            passage.lang = replacement.lang;
            passage.content = replacement.content;
            passage.code = replacement.code;
            passage.html = replacement.html;
            passage.css = replacement.css;
            passage.javascript = replacement.javascript;
            passage.filename = replacement.filename;
            passage.mimeType = replacement.mimeType;
        }
        if(passage.mirrorEntire && passage.mirror != null){
            passage.title = replacement.title;
        }
        if(passage.bestOfEntire && passage.bestOf != null){
            passage.title = replacement.title;
        }
        if(replacing && passage.mirror != null){
            passage.isMirrored = true;
        }
        if(replacing && passage.bestOf != null){
            passage.isBestOf = true;
        }
        passage = await getPassage(passage, false);
        if(replacing){
        replacement = await getPassage(replacement, false);
        }
        console.log('test'+passage.originalSourceList.length);
        console.log(passage.sourceList.length);
        if(passage.public == true && !passage.forum){
            // var subPassages = await Passage.find({parent: passage_id}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
            var subPassages = await Passage.paginate({parent: passage_id}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList collaborators versions mirror bestOf best'});
            // if(replacing){
            //     var subPassages = await Passage.paginate({parent: replacement._id, comment:false}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList collaborators versions mirror bestOf best'});
            // }
            subPassages = subPassages.docs;
        }
        else{
            if(passage.displayHTML.length > 0 || passage.displayCSS.length > 0 || passage.displayJavascript.length > 0){
                passage.showIframe = true;
            }
            if(passage.forum){
                var subPassages = await Passage.paginate({parent: passage_id, comment:false}, {sort: '_id', page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList collaborators versions mirror bestOf best'});
                // if(replacing){
                //     var subPassages = await Passage.paginate({parent: replacement._id, comment:false}, {sort: '_id', page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList collaborators versions mirror bestOf best'});
                // }
                subPassages = subPassages.docs;
            }
            else{ 
                //private passages
                var subPassages = await Passage.find({parent: passage_id, comment: false, author: {
                    $in: [passageUsers]
                }}).populate('author users sourceList collaborators versions mirror bestOf best');  
                // if(replacing){
                //     var subPassages = await Passage.find({parent: replacement._id, comment: false}).populate('author users sourceList collaborators versions mirror bestOf best');
                // }
                // subPassages = subPassages.filter(function(p){
                //     return p.comment ? false : true;
                // });
                //will query for no comments after finding out why it doesnt work.
                subPassages = subPassages.filter(function(p){
                    return ((p.personal && (!req.session.user || p.author._id.toString() != req.session.user._id.toString())) || p.comment) ? false : true;
                });
            }
        }
        //we have to do this because of issues with populating passage.passages foreign keys
        if(!passage.public && !passage.forum){
            // passage.passages = passage.passages.filter(function(p){
            //     return !p.publicReply;
            // });
            //reorder sub passages to match order of passage.passages
            var reordered = Array(subPassages.length).fill(0);
            for(var i = 0; i < passage.passages.length; ++i){
                for(var j = 0; j < subPassages.length; ++j){
                    if(subPassages[j]._id.toString() == passage.passages[i]._id.toString()){
                        reordered[i] = subPassages[j];
                    }
                }
            }
            //idk why but sometimes in production there were extra 0s...
            //need to test more and bugfix algorithm above
            reordered = reordered.filter(x => x !== 0); //just get rid of extra 0s
        }
        else{
            var reordered = subPassages;
        }
        if(passage.passages.length < 1){
            reordered = subPassages;
        }
        passage.passages = reordered;
        // for(const p of passage.passages){
        //     passage.passages[p] = bubbleUpAll(p);
        //     // passage.passages[p].location = await returnPassageLocation(passage.passages[p]);
        // }
        for(var i = 0; i < passage.passages.length; ++i){
            passage.passages[i] = await getPassage(passage.passages[i]);
        }
        if(passage.parent != null){
            var parentID = passage.parent._id;
        }
        else{
            var parentID = 'root';
        }
        passage = await fillUsedInListSingle(passage);
        // passage.location = await returnPassageLocation(passage);
        passage.passages = await fillUsedInList(passage.passages);
        if(subforums){
            passage.passages = passage.subforums;
        }
        else if(comments){
            var comments = await Passage.paginate({$or: [
                {comment: true},
                {publicReply:true}
            ],parent:passage._id}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList'});
            passage.passages = comments.docs;
            for(var i = 0; i < passage.passages.length; ++i){
                passage.passages[i] = await getPassage(passage.passages[i]);
            }
        }else{
            //remove subforums from passages
            passage.passages = passage.passages.filter(function(value, index, array){
                return value.sub == false;
            });
        }
        var bigRes = {
            subPassages: passage.passages,
            passage: passage,
            passageTitle: passage.title,
            passageUsers: passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: passage, passages: false, totalPages: totalPages, docsPerPage: DOCS_PER_PAGE,
            ISMOBILE: ISMOBILE,
            parentID: parentID

        };
        if(!bigRes){
            return res.redirect('/');
        }
        if(bigRes.passage.personal && bigRes.passage.author._id.toString() != req.session.user._id &&
            !bigRes.passage.users.includes(req.session.user._id)){
            return res.redirect('/');
        }
        if(bigRes.passage.personal && bigRes.passage.author._id.toString() != req.session.user._id &&
            !bigRes.passage.users.includes(req.session.user._id)){
            return res.redirect('/');
        }
        bigRes.subPassages = await fillUsedInList(bigRes.subPassages);
        bigRes.subPassages.filter(function(p){
            if(p.personal && p.author._id.toString() != req.session.user._id.toString() && !p.users.includes(req.session.user._id.toString())){
                return false;
            }
            return true;
        });
        console.log('test2'+passage.originalSourceList.length);
        console.log(passage.sourceList.length);
        return bigRes;
    }
    async function logVisit(req, passageID){
        let ipAddress = req.ip; // Default to req.ip

        // Check Cloudflare headers for real client IP address
        if (req.headers['cf-connecting-ip']) {
        ipAddress = req.headers['cf-connecting-ip'];
        } else if (req.headers['x-forwarded-for']) {
        // Use X-Forwarded-For header if available
        ipAddress = req.headers['x-forwarded-for'].split(',')[0];
        }


        // Check other custom headers if needed


        const existingVisitor = await Visitor.findOne({ ipAddress });


        if (!existingVisitor) {
        // Create a new visitor entry
        const newVisitor = new Visitor({ ipAddress: ipAddress, user: req.session.user || null, visited: passageID });
        await newVisitor.save();
        }
    }
    app.get('/thread', async (req, res) => {
        // ALT
        var bigRes = await getBigPassage(req, res);
        await logVisit(req, bigRes.passage._id);
        if(!res.headersSent){
            await getRecursiveSpecials(bigRes.passage);
            res.render("thread", {subPassages: bigRes.passage.passages, passageTitle: bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
                ISMOBILE: bigRes.ISMOBILE,
                thread: true,
                parentID: bigRes.parentID,
                topicID: bigRes.passage._id,
                subPassage: true
            });
        }
    });
    app.get('/cat', async (req, res) => {
        var pNumber = req.query.pNumber;
        var search = req.query.search || '';
        var find = {
            parent: req.query._id.toString(),
            title: {$regex:search,$options:'i'},
            // $or: [
            //     {title: {$regex:search,$options:'i'}},
            //     {content: {$regex:search,$options:'i'}},
            //     {code: {$regex:search,$options:'i'}},
            // ],
        };
        if(search == ''){
            find = {
                parent: req.query._id.toString()
            };
        }
        var parent = await Passage.findOne({_id: req.query._id});
        var topics = await Passage.paginate(find, {sort: '-date', page: pNumber, limit: 20, populate: 'passages.author'});
        var totalDocuments = await Passage.countDocuments(find);
        var totalPages = Math.floor(totalDocuments/20) + 1;
        for (const topic of topics.docs){
            topic.numViews = await scripts.getNumViews(topic._id);
            if(topic.passages && topic.passages.length > 0){
                topic.lastPost = 'by ' + topic.passages.at(-1).author.name + '<br>' + topic.passages.at(-1).date.toLocaleDateString();
            }else{
                topic.lastPost = 'No Posts Yet.';
            }
        }
        topics = topics.docs;
        var stickieds = await Passage.find({parent:req.query._id.toString(), stickied: true});
        return res.render('cat', {
            _id: parent._id,
            name: parent.title,
            topics: topics,
            postCount: topics.length,
            totalPages: totalPages,
            stickieds: stickieds
        });
        // var s = false;
        // var categories = await Passage.find({forumType: 'category'});
        // var subcats = await Passage.find({forumType: 'subcat'});
        // var subforums = await Passage.find({forumType: 'subforum'});
        // var focus;
        // if(req.query.s){
        //     s = true;
        //     var subForum = await Passage.findOne({_id: req.query.s});
        // }
        // if(s == false){
        //     var topics = await Passage.find({
        //         parent: req.query.f,
        //         sub: false
        //     });
        // }
        // else{
        //     var topics = await Passage.find({
        //         parent: req.query.s,
        //         sub: true
        //     });
        // }
        // console.log(req.query);
        // if(!req.query.f && !req.query.s){
        //     console.log('TEST2');
        //     return res.render("forum_body", {
        //         categories: categories,
        //         subcats: subcats,
        //         subforums: subforums
        //     });
        // }
        // var parent = await Passage.findOne({_id: req.query.f});
        // res.render('cat', {
        //     name: subForum ? subForum.title : false || parent.title || '',
        //     topics: topics,
        //     postCount: topics.length
        // })
    });
    async function clearForum(){
        await Passage.deleteMany({forumSpecial: true});
    }
    //fill forum with presets
    async function fillForum(req){
        const fsp = require('fs').promises;
        var file = await fsp.readFile('./dist/json/forum.json');
        var json = JSON.parse(file);
        //create over directory passage
        var infinity = await Passage.create({
            author: req.session.user,
            users: [req.session.user],
            parent: null,
            title: "Infinity Forum",
            forumSpecial: true,
            tracker: 0,
            forumType: 'header'
        });
        infinity = await Passage.findOne({forumType: 'header'});
        for(const category of json.categories){
            var passage = await Passage.create({
                author: req.session.user,
                users: [req.session.user],
                parent: infinity._id.toString(),
                title: category.name,
                forumSpecial: true,
                tracker: category.tracker,
                forumType: 'category'
            });
            infinity.passages.push(passage);
            infinity.markModified('passages');
            await infinity.save();
            for(const cat of json.subcats){
                if(cat.parentTracker == category.tracker){
                    var passage2 = await Passage.create({
                        author: req.session.user,
                        users: [req.session.user],
                        parent: passage._id,
                        forum: true,
                        title: cat.name,
                        forumSpecial: true,
                        content: cat.desc,
                        tracker:cat.tracker,
                        parentTracker: category.tracker,
                        forumType: 'subcat'
                    });
                    passage.passages.push(passage2);
                    passage.markModified('passages');
                    await passage.save();
                    for(const sub of json.subforum){
                        if(sub.parentTracker == cat.tracker){
                            var passage3 = await Passage.create({
                                author: req.session.user,
                                users: [req.session.user],
                                parent: passage2._id,
                                forum: true,
                                title: sub.name,
                                forumSpecial: true,
                                parentTracker: cat.tracker,
                                tracker: sub.tracker,
                                forumType: 'subforum',
                                sub: true
                            });
                            passage2.subforums.push(passage3);
                            passage2.markModified('subforums');
                            await passage2.save();
                        }
                    }
                }
            }
        }
        // for(const category of json.categories){
        //     await Category.create({
        //         name: category.name,
        //         tracker: category.tracker
        //     });
        // }
        // for(const cat of json.subcats){
        //     await Subcat.create({
        //         parentTracker: cat.parentTracker,
        //         name: cat.name,
        //         desc: cat.desc,
        //         tracker: cat.tracker
        //     });
        // }
        // for(const sub of json.subforum){
        //     await Subforum.create({
        //         parentTracker: sub.parentTracker,
        //         tracker: sub.tracker,
        //         name: sub.name,
        //         desc: sub.desc
        //     });
        // }
        console.log("DONE.");
    }
    // app.get('/projects', async (req, res) => {
        
    //     res.render("projects");
    // });
    async function getRecursiveSourceList(sourceList, sources=[], passage, getAuthor=false){
        for(const source of sourceList){
            if(getAuthor){
                var sourcePassage = await Passage.findOne({_id:source}).populate('author');
            }else{
                var sourcePassage = await Passage.findOne({_id:source});
            }
            //get specials as well
            // sourcePassage = await getPassage(sourcePassage);
            if(sourcePassage != null){
                var special = null;
                // console.log(sourcePassage._id);
                if(sources.includes(sourcePassage)){
                    continue;
                }                
                sources.push(sourcePassage);
                if(source.showBestOf == true){
                    special = await Passage.findOne({parent: source._id}, null, {sort: {stars: -1}});
                    special = special._id;
                }
                if(source.best != null){
                    special = source.best;
                }
                if(source.repost != null){
                    special = source.repost;
                }
                if(source.bestOf != null){
                    special = source.bestOf;
                }
                if(source.mirror != null){
                    special = source.mirror;
                }
                if(special != null){
                    if(getAuthor){
                        special = await Passage.findOne({_id:special}).populate('author');
                    }else{
                        special = await Passage.findOne({_id:special});
                    }
                    special = await Passage.findOne({_id:special});
                    sources.push(special);
                }
                sources = await getRecursiveSourceList(sourcePassage.sourceList, sources, passage, getAuthor);
            }
        }
        // console.log(sources);
        sources = sources.filter(i => i);
        sources = Object.values(sources.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
        return sources;
    }

    // app.get('/feed', async (req, res) => {
    //     const ISMOBILE = browser(req.headers['user-agent']).mobile;
    //     //REX
    //     if(req.session.CESCONNECT){
    //         getRemotePage(req, res);
    //     }
    //     else{
    //         let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    //         let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
    //         let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
    //         let golden = '';
    //         let addPassageAllowed = true;
    //         let addChapterAllowed = true;
    //         var user = req.session.user || null;
    //         const followings = await Follower.find({ user: req.session.user._id.toString() });
    //         const followingIds = followings.map(f => f.following._id);
    //         let passages = await Passage.find({
    //             deleted: false,
    //             personal: false,
    //             author: { $in: followingIds },
    //         }).populate('author users sourceList parent').sort({stars:-1, _id:-1}).limit(DOCS_PER_PAGE);
    //         for(var i = 0; i < passages.length; ++i){
    //             passages[i] = await getPassage(passages[i]);
    //         }
    //         let passageUsers = [];
    //         let bookmarks = [];
    //         // if(req.session.user){
    //         //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
    //         // }
    //         if(req.session.user){
    //             bookmarks = getBookmarks(req.session.user);
    //         }
    //         passages = await fillUsedInList(passages);
    //         res.render("stream", {
    //             subPassages: false,
    //             passageTitle: false, 
    //             scripts: scripts, 
    //             passages: passages, 
    //             passage: {id:'root', author: {
    //                 _id: 'root',
    //                 username: 'Sasame'
    //             }},
    //             bookmarks: bookmarks,
    //             ISMOBILE: ISMOBILE,
    //             page: 'feed',
    //             whichPage: 'feed',
    //             thread: false
    //         });
    //     }
    // });
    app.post('/interact', async (req, res) => {
        var interaction = await Interaction.create({
            keeper: req.body.keeper,
            user: req.body.userID,
            passage: req.body.passageID,
            control: req.body.control || 0,
            content: req.body.content
        });
        var passage = await Passage.findOne({_id: req.body.passageID});
        passage.interactions.push(interaction._id);
        passage.markModified('interactions');
        await passage.save();
        res.send("Done.");
    });
    app.get('/interactions', async (req, res) => {
        if(req.session.user._id .toString() == req.query.keeper || req.session.user._id.toString() == req.query.userID){
            var interactions = await Interaction.find({
                control: req.query.control,
                passage: req.query.passage,
                keeper: req.query.keeper,
                user: req.query.userID
            });
            return res.send(JSON.stringify(interactions));
        }
        return res.send(false);
    });
    app.get('/donate', async function(req, res){
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var usd = await totalUSD();
        var stars = await totalStarsGiven();
        if(req.session.user){
            var subscriptionQuantity = req.session.user.subscriptionQuantity;
        }else{
            var subscriptionQuantity = 0;
        }
        res.render('donate', {
            passage: {id: 'root'}, usd: Math.floor((await scripts.getMaxToGiveOut())/100), stars: stars,
            totalUSD: Math.floor(usd/100),
            donateLink: process.env.STRIPE_DONATE_LINK,
            subscribeLink: process.env.STRIPE_SUBSCRIBE_LINK,
            subscriptionQuantity: subscriptionQuantity,
        });
    });
    //Search
    app.post('/search_leaderboard/', async (req, res) => {
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let results = await User.find({

            username: {
            $regex: search,
            $options: 'i',
        }}).sort('-starsGiven').limit(20);
        if(search == ''){
            var rank = true;
        }
        else{
            var rank = false;
        }
        res.render("leaders", {
            users: results,
            page: 1,
            rank: rank
        });
    });
    app.post('/search_profile/', async (req, res) => {
        console.log("TEST");
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var find = {
            author: req.body._id,
            deleted: false,
            personal: false,
            versionOf: null,
            title: {$regex:search,$options:'i'},
            // $or: [
            //     {title: {$regex:search,$options:'i'}},
            //     {content: {$regex:search,$options:'i'}},
            //     {code: {$regex:search,$options:'i'}},
            // ],
        };
        if(req.body.label != 'All'){
            find.label = req.body.label;
        }
        var sort = {stars: -1, _id: -1};
        switch(req.body.sort){
            case 'Most Stars':
                sort = {stars: -1, _id: -1};
                break;
            case 'Newest-Oldest':
                sort = {date: -1};
                console.log(find.author);
                break;
            case 'Oldest-Newest':
                sort = {date: 1};
                break;
        }
        let results = await Passage.find(find).populate('author users sourceList').sort(sort).limit(DOCS_PER_PAGE);
        for(var i = 0; i < results.length; ++i){
            results[i] = await getPassage(results[i]);
        }
        res.render("passages", {
            passages: results,
            subPassages: false,
            sub: true,
            subPassage: false,
            page: 1
        });
    });
    app.post('/search_messages/', async (req, res) => {
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var find = {
            to: req.session.user._id,
            title: {$regex:search,$options:'i'},
            // $or: [
            //     {title: {$regex:search,$options:'i'}},
            //     {content: {$regex:search,$options:'i'}},
            //     {code: {$regex:search,$options:'i'}},
            // ],
        };
        if(req.body.label != 'All'){
            find.label = req.body.label;
        }
        var sort = {stars: -1, _id: -1};
        switch(req.body.sort){
            case 'Most Stars':
                sort = {stars: -1, _id: -1};
                break;
            case 'Newest-Oldest':
                sort = {date: -1};
                break;
            case 'Oldest-Newest':
                sort = {date: 1};
                break;
        }
        var messages = await Message.find(find).populate('passage').sort(sort).limit(DOCS_PER_PAGE);
        var passages = [];
        for(const message of messages){
            var p = await Passage.findOne({
                _id: message.passage._id
            }).populate('author users sourcelist');
            passages.push(p);
        }
        for(var i = 0; i < passages.length; ++i){
            passages[i] = await getPassage(passage);
        }
        res.render("passages", {
            passages: passages,
            subPassages: false,
            sub: true,
            subPassage:false,
            page: 1
        });
    });
    app.post('/ppe_search/', async (req, res) => {
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let parent = req.body.parent == 'root' ? null : req.body.parent;
        let results = await Passage.find({
            parent: parent,
            deleted: false,
            personal: false,
            simulated: false,
            mimeType: 'image',
            title: {
            $regex: search,
            $options: 'i',
        }}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
        for(var i = 0; i < results.length; ++i){
            results[i] = await getPassage(results[i]);
        }
        res.render("ppe_thumbnails", {
            thumbnails: results,
        });
    });
    // async function fixMissingInParent(){
    //     let passages = await Passage.find();
    //     for(const passage of passages){
    //         if(passage.parent != null){
    //             console.log('test:'+passage.parent);
    //             var parent = await Passage.findOne({_id: passage.parent.toString()});
    //             console.log(parent);
    //             console.log(parent.passages.includes(passage));
    //             // if(!parent.passages.includes(passage)){
    //             //     parent.passages.push(passages);
    //             // }
    //             // else{
    //             //     continue;
    //             // }
    //         }
    //     }
    // }
    // (async function(){
    //     await fixMissingInParent();
    // })();
    app.post('/search_passage/', async (req, res) => {
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var find = {
            deleted: false,
            personal: false,
            // versionOf: null,
            parent: req.body._id,
            title: {$regex:search,$options:'i'},
            // $or: [
            //     {title: {$regex:search,$options:'i'}},
            //     {content: {$regex:search,$options:'i'}},
            //     {code: {$regex:search,$options:'i'}},
            // ],
        };
        if(req.body.label != 'All'){
            find.label = req.body.label;
        }
        var sort = {stars: -1, _id: -1};
        switch(req.body.sort){
            case 'Most Stars':
                sort = {stars: -1, _id: -1};
                break;
            case 'Newest-Oldest':
                sort = {date: -1};
                break;
            case 'Oldest-Newest':
                sort = {date: 1};
                break;
        }
        console.log(sort);
        let results = await Passage.find(find).populate('author users sourceList').sort(sort).limit(DOCS_PER_PAGE);
        if(results.length < 1 && req.session.user){
            var parent = await Passage.findOne({_id: req.body._id});
            let users = [req.session.user._id];
            if(parent.public && !parent.personal){
                //by default additions should have the same userlist
                if(parent.users.includes(req.session.user._id)){
                    users = parent.users;
                }
                else{
                    for(const u of parent.users){
                        users.push(u);
                    }
                }
                //can only add to private or personal if on the userlist
                if(!scripts.isPassageUser(req.session.user, parent) && (!parent.public || parent.personal)){
                    //do nothing
                }
                else if(parent.public_daemon == 2 || parent.default_daemon){
                    //do nothing
                }
                else if(parent.public){
                    // let passage = await Passage.create({
                    //     author: req.session.user._id,
                    //     users: users,
                    //     parent: req.body._id,
                    //     title: req.body.search,
                    //     public: true
                    // });
                    // parent.passages.push(passage);
                    // await parent.save();
                    // results = [passage];
                }
            }
        }
        for(var i = 0; i < results.length; ++i){
            results[i] = await getPassage(results[i]);
        }
        res.render("passages", {
            passages: results,
            subPassages: false,
            sub: true,
            subPassage:true,
            page: 1
        });
    });
    function escapeBackSlash(str){
        var temp = str.replace('\\', '\\\\');
        console.log(temp);
        return str;
    }
    async function labelOldPassages(){
        var passages = await Passage.find({});
        for(const passage of passages){
            if(passage.public && passage.forum){
                passage.label = 'Task';
            }
            else if(!passage.public && !passage.forum){
                passage.label = 'Project';
            }
            else if(passage.forum){
                passage.label = 'Forum';
            }
            await passage.save();
        }
        console.log("Old Passages labeled.");
    }
    // (async function(){
    //     await labelOldPassages();
    // })();
    app.post('/search/', async (req, res) => {
        var search = req.body.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var label = req.body.label;
        var matchStage = {
            deleted: false,
            versionOf: null,
            personal: req.body.personal === 'true', // Convert string to boolean
            simulated: false,
            title: {$regex:search,$options:'i'},
        };

        // Add label filter if not 'All'
        if (label != 'All') {
            matchStage.label = req.body.label;
        }

        // Add personal filter if true
        if (req.body.personal === 'true' && req.session.user && req.session.user._id) {
            matchStage.users = { $in: [req.session.user._id] };
        }

        switch (req.body.whichPage) {
            case 'tasks':
                matchStage.public = true;
                matchStage.forum = false;
                break;
            case 'projects':
                matchStage.public = false;
                matchStage.forum = false;
                break;
            // case 'feed': // ... (your feed logic) ...
        }

        var sort = { stars: -1, _id: -1 };
        var results;
        var nextCursor = null;
        var feed = false;
        switch (req.body.sort) {
            case 'Most Relevant':
                if(search != '' || label != 'All'){
                        sort = {stars: -1, _id: -1};
                    }else{
                         // Generate feed for guest users
                        console.log("Guest feed");
                        var result = await generateGuestFeed(1, DOCS_PER_PAGE);
                        var passages = {};
                        passages.docs = [];
                        if('feed' in result){
                            for (let i = 0; i < result.feed.length; i++) {
                              const processedPassage = await getPassage(result.feed[i]);
                              passages.docs.push(processedPassage);
                            }
                            var results = passages.docs;
                        }else{
                            return res.send("No more passages.");
                        }
                        feed = true;
                    }
                break;
            case 'Most Stars':
                sort = { stars: -1, _id: -1 };
                break;
            case 'Most Cited':
                sort = { stars: -1, _id: -1 };
                break;
            case 'Newest-Oldest':
                sort = { date: -1 };
                break;
            case 'Oldest-Newest':
                sort = { date: 1 };
                break;
        }

        if (!feed) {
            results = await Passage.find(matchStage).populate('author users sourceList parent').sort(sort).limit(DOCS_PER_PAGE);   
            for(var i = 0; i < results.length; ++i){
                results[i] = await fillUsedInList(results[i]);
                results[i] = await getPassage(results[i]);
            }         
        }

        res.render("passages", {
            passages: results,
            subPassages: false,
            sub: true,
            subPassage: false,
            page: 1
        });
    });
    async function paginate(model, pageSize, cursor, sortFields = { _id: -1 }, find = {}) {
      let query = { ...find }; // Start with the provided find query

      if (cursor) {
        query.$and = [
          { ...find }, // Ensure existing find conditions are still applied
          {
            $or: Object.keys(sortFields).map((field, index, array) => {
              const condition = {};
              if (index < array.length - 1) {
                // For preceding sort fields, match the cursor value exactly
                for (let i = 0; i < index; i++) {
                  const sortField = array[i];
                  condition[sortField] = cursor[sortField];
                }
                // For the current sort field, apply the less than/greater than condition
                condition[field] = sortFields[field] === 1 ? { $gt: cursor[field] } : { $lt: cursor[field] };
              } else {
                // For the last sort field, apply the less than/greater than condition
                condition[field] = sortFields[field] === 1 ? { $gt: cursor[field] } : { $lt: cursor[field] };
                // For preceding sort fields, match the cursor value exactly
                for (let i = 0; i < index; i++) {
                  const sortField = array[i];
                  condition[sortField] = cursor[sortField];
                }
              }
              return condition;
            }),
          },
        ];
      }

      const results = await model.find(query)
        .sort(sortFields)
        .limit(pageSize)
        .exec();

      let nextCursor = null;
      if (results.length === pageSize) {
        nextCursor = {};
        for (const field in sortFields) {
          nextCursor[field] = results[results.length - 1][field];
        }
      }

      return {
        data: results,
        nextCursor
      };
    }
    async function getBookmarks(user){
        return await Bookmark.find({user:user._id}).populate('passage');
    }
    async function bookmarkPassage(_id, _for){
        let user = await User.findOne({_id: _for});
        // user.bookmarks.push(_id);
        // await user.save();
        var passage = await Passage.findOne({_id: _id});
        let bookmark = await Bookmark.create({
            user: user,
            passage: passage
        });
        return "Done.";
    }
    app.post('/bookmark_passage', async (req, res) => {
        if(req.body.content == ''){
            await bookmarkPassage(req.body._id, req.session.user._id);
        }
        else{
            let passage = await Passage.findOne({_id: req.body._id});
            let copy = await passageController.copyPassage(passage, [req.session.user], null, function(){});
            copy[req.body.which] = req.body.content;
            await copy.save();
            await bookmarkPassage(copy._id, req.session.user._id);
        }
        res.send('Done.');
    });
    // Add security if reactivating check if passage user first
    // app.post('/copy_passage/', async (req, res) => {
    //     let copy = await passageController.copyPassage(req, res, function(){
            
    //     });
    //     let passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList');
    //     res.render('passage', {subPassages: false, passage: copy, sub: true});
    // });
    //same as citing
    app.post('/transfer_bookmark', async (req, res) => {
        if(!req.session.user){
                return res.send("<h2 style='text-align:center;color:red;'>You must be logged in.</h2>");
            }
        let _id = req.body._id;
        let parent = req.body.parent;
        //first check if parent allow submissions (is Public)
        if(parent !== 'root' && req.body.focus == 'false'){
            let parentPassage = await Passage.findOne({_id: parent});
            if(parentPassage.public === false && parentPassage.author.toString() != req.session.user._id.toString() && !scripts.isPassageUser(req.session.user, parentPassage)){
                return res.send("<h2 style='text-align:center;color:red;'>Passage is private. Ask to be on the Userlist, or consider Bookmarking it, and copying it over to your own passage (press \"cite\").</h2>");
            }
        }
        //get passage to copy
        let user;
        let passage = await Passage.findOne({_id: req.body._id});
        //reset author list
        if (typeof req.session.user === 'undefined' || req.session.user === null) {
            user = null;
        }
        else{
            user = [req.session.user];
        }
        parent = req.body.parent == 'root' ? null : req.body.parent;
        if(req.body.focus == 'false'){
            if(req.body.which == 'comments'){
                var comment = true;
            }
            else{
                var comment = false;
            }
            console.log(comment);
            let copy = await passageController.copyPassage(passage, user, parent, function(){
                
            }, false, comment);
            copy = await getPassage(copy);
            if(req.body.which && req.body.which == 'cat'){
                return res.render('cat_row', {subPassages: false, topic: copy, sub: true});
            }
            else{
                return res.render('passage', {subPassage: true, subPassages: false, passage: copy, sub: true});
            }
        }else{
            var title = passage.title == '' ? 'Untitled' : passage.title;
            //add passage to sourcelist
            parent = await Passage.findOne({_id: req.body.parent});
            if((!req.session.user && !req.session.user.admin) || ((req.session.user._id.toString() !== parent.author._id.toString()) && !req.session.user.admin)){
                return res.send("<h2 style='text-align:center;color:red;'>You can only add sources to your own passages.</h2>");
            }
            var parentUsageList = await Passage.find({
                sourceList: {
                    $in: [parent._id]
                },
                versionOf: null
            }, {_id:1, author:0, passages:0}).lean();
            parentUsageList = parentUsageList.map(item => item._id.toString());
            if(parent._id == passage._id || parentUsageList.includes(passage._id.toString())){
                return res.send('<div data-token="'+passage._id+'"data-title="'+title+'"class="new-source">"'+title+'" Could not be added. Circular citation.</div>');
            }
            parent.sourceList.push(passage._id);
            //remove duplicates
            parent.sourceList = Object.values(parent.sourceList.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
            parent.markModified('sourceList');
            await parent.save();
            //passage usage list has grown so put it higher in feed
            passage.lastUpdated = Date.now();
            await passage.save();
            console.log('sources:'+parent.sourceList);
            var test = await Passage.findOne({_id:parent._id});
            console.log('sources'+test.sourceList);
            return res.send('<div data-token="'+passage._id+'"data-title="'+title+'"class="new-source">"'+title+'" Added to Sourcelist.</div>');
        }
    });
    app.post('/add_daemon', async (req, res) => {
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
    });
    app.post('/remove_daemon', async (req, res) => {
        if(req.session.user){
            let passage = req.body._id;
            let daemon = await Passage.findOne({_id: passage});
            let user = await User.findOne({_id: req.session.user._id});
            // user.daemons.forEach(function(d, i){
            //     if(d._id.toString() == daemon._id.toString()){
            //         user.daemons.splice(i, 1);
            //     }
            // });
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
    });
    app.post('/sort_daemons', async (req, res) => {
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
    });
    app.get('/leaderboard', async (req, res) => {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var page = req.query.page || 1;
        var limit = DOCS_PER_PAGE * 2;
        // limit = 2;
        // let users = await User.find().sort('-starsGiven');
        let users = await User.paginate({}, {sort: '-starsGiven _id', page: page, limit: limit});
        users = users.docs;
        var i = 1;
        for(const user of users){
            user.rank = i + ((page-1)*limit);
            ++i;
        }
        if(page == 1){
            return res.render('leaderboard', {passage: {id: 'root'},users: users, scripts: scripts,
        ISMOBILE: ISMOBILE, page: page, rank: true});
        }
        else{
            return res.render('leaders', {users: users, page: page, rank: false});
        }
    });
    app.post('/add_user', async (req, res) => {
        let passageId = req.body.passageId;
        let username = req.body.username;
        let user = await User.findOne({username: username});
        let passage = await Passage.findOne({_id: passageId});
        if(user && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            passage.users.push(user._id.toString());
            passage.markModified('users');
            await passage.save();
            res.send("User Added");
        }
        else{
            res.send("User not found.");
        }
    });
    app.post('/add_collaborator', async (req, res) => {
        var passage = await Passage.findOne({_id: req.body.passageID});
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            var collaborator = await User.findOne({username:req.body.username});
            if(collaborator == null){
                return res.send("Collaborator not found.");
            }
            console.log(collaborator._id.toString());
            console.log(req.session.user._id.toString());
            console.log(collaborator._id.toString() != req.session.user._id.toString());
            if(!passage.collaborators.includes(collaborator._id.toString()) && collaborator._id.toString() != req.session.user._id.toString()){
                passage.collaborators.push(collaborator._id.toString());
                passage.markModified('collaborators');
            }else{
                return res.send("Not allowed. Can't add author or user already added.");
            }
            //if possible add user
            // let collabUser = await User.findOne({email: req.body.email});
            // if(collabUser != null && !isPassageUser(collabUser, passage)){
            //     passage.users.push(collabUser._id);
            //     passage.markModified('users');
            // }
            await passage.save();
            return res.send("Collaborator Added");
        }
        else{
            return res.send("Wrong permissions.");
        }
    });
    app.post('/passage_setting', async (req, res) => {
        let _id = req.body._id;
        let setting = req.body.setting;
        let user = await User.findOne({_id: req.session.user._id});
        let passage = await Passage.findOne({_id: _id}).populate('author');
        switch(setting){
            case 'private':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.public = !passage.public;
                }
                break;
            case 'public':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.public = !passage.public;
                }
                break;
            case 'forum':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.forum = !passage.forum;
                }
                break;
            case 'personal':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.personal = !passage.personal;
                }
                break;
            case 'cross-origin-allowed':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.personal_cross_origin = !passage.personal_cross_origin;
                }
                break;
            case 'request-public-daemon':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.public_daemon = 1;
                }
                break;
            case 'admin-make-public-daemon':
                if(user.admin){
                    passage.public_daemon == 2 ? 1 :  2;
                }
                break;
            case 'admin-make-default-daemon':
                if(user.admin){
                    passage.default_daemon = !passage.default_daemon;
                }
                break;
            case 'distraction-free':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.distraction_free = !passage.distraction_free;
                }
                break;
            case 'bubbling':
                if(passage.author._id.toString() == user._id.toString()){
                    passage.bubbling = !passage.bubbling;
                }
                break;
        }
        await passage.save();
        res.send("Done")
    });
    app.post('/update_mirroring', async (req, res) => {
        let passage = await Passage.findOne({_id: req.body._id});
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            try{
                var mirror = await Passage.findOne({_id:req.body.mirror.trim()});
            }
            catch(e){
                console.log("Null value");
                var mirror = null;
            }
            try{
                var bestOf = await Passage.findOne({_id:req.body.bestOf.trim()});
            }
            catch(e){
                console.log("Null value");
                var bestOf = null;
            }
            if(mirror != null){
                passage.mirror = mirror._id;
            }
            else{
                passage.mirror = null;
            }
            if(bestOf != null){
                passage.bestOf = bestOf._id;
            }
            else{
                passage.bestOf = null;
            }
            passage.mirrorContent = req.body.mirrorContent;
            passage.mirrorEntire = req.body.mirrorEntire;
            passage.bestOfContent = req.body.bestOfContent;
            passage.bestOfEntire = req.body.bestOfEntire;
            await passage.save();
            return res.send("Done.");
        }
        else{
            return res.send("Not your passage.");
        }
    });
    app.post('/remove_user', async (req, res) => {
        let passageID = req.body.passageID;
        let userID = req.body.userID;
        let passage = await Passage.findOne({_id: passageID});
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            // passage.users.forEach(async function(u, index){
            //     if(u == userID){
            //         //remove user
            //         passage.users.splice(index, 1);
            //     }
            // });
            var index = 0;
            for(const u of passage.users){
                if(u == userID){
                    //remove user
                    passage.users.splice(index, 1);
                }
                ++index;
            }
            passage.markModified('users');
            await passage.save();
            res.send("Done.");
        }
    });
    app.post('/remove_collaber', async (req, res) => {
        let passageID = req.body.passageID;
        let userID = req.body.userID;
        let passage = await Passage.findOne({_id: passageID});
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            // passage.users.forEach(async function(u, index){
            //     if(u == userID){
            //         //remove user
            //         passage.users.splice(index, 1);
            //     }
            // });
            var index = 0;
            for(const u of passage.collaborators){
                if(u == userID){
                    //remove user
                    passage.collaborators.splice(index, 1);
                }
                ++index;
            }
            passage.markModified('collaborators');
            await passage.save();
            res.send("Done.");
        }
    });
    app.post('/remove-source', async (req, res) => {
        let passageID = req.body.passageID;
        let sourceID = req.body.sourceID;
        let passage = await Passage.findOne({_id: passageID});
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            var index = 0;
            for(const s of passage.sourceList){
                if(s == sourceID){
                    //remove source
                    passage.sourceList.splice(index, 1);
                }
                ++index;
            }
            passage.markModified('sourceList');
            await passage.save();
            res.send("Done.");
        }
    });
    async function regenerateSession(req){
        if(req.session.user){
            let user = await User.findOne({_id: req.session.user._id});
            req.session.user = user;
        }
    }
    app.post('/remove_bookmark', async (req, res) => {
        let _id = req.body._id;
        // let user = await User.findOne({_id: req.session.user._id});
        // user.bookmarks.forEach((bookmark, i) => {
        //     if(bookmark._id.toString() == _id.toString()){
        //         user.bookmarks.splice(i, 1);
        //     }
        // });
        await Bookmark.deleteOne({_id:_id});
        // await user.save();
        res.send("Done.");
    });
    app.post('/stripe_webhook', bodyParser.raw({ type: 'application/json' }), async (request, response) => {
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        const endpointSecret = await accessSecret("STRIPE_ENDPOINT_SECRET_KEY");
        const payload = request.body;
        const SYSTEM = await System.findOne({});

        console.log("Got payload: " + payload);
        const sig = request.headers['stripe-signature'];
        let event;
        try {
            event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
            console.log(event.type);
        } catch (err) {
            console.log(err);
            return response.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            try {
                const session = event.data.object;
                const amount = session.amount_total;
                const customerEmail = session.customer_details?.email; //Use optional chaining

                // 1. Get the Charge ID from the completed session.
                const chargeId = session.payment_intent ? await stripe.paymentIntents.retrieve(session.payment_intent).then(pi => pi.latest_charge) : null;

                 if (chargeId) {
                    // 2. Retrieve the Charge object to get the balance transaction.
                    const charge = await stripe.charges.retrieve(chargeId);
                    const balanceTransactionId = charge.balance_transaction;

                    if (balanceTransactionId) {
                        // 3. Retrieve the Balance Transaction to get the fee.
                        const balanceTransaction = await stripe.balanceTransactions.retrieve(balanceTransactionId);
                        const fee = balanceTransaction.fee;
                        const net = balanceTransaction.net;

                        // console.log(`Stripe Fee: ${fee}`);
                        // console.log(`Net Amount: ${net}`);

                        //Save recording passage in database and give user correct number of stars
                        //get user from email
                        var user = await User.findOne({ email: customerEmail });
                        if (user) {
                            var totalAmount = await totalUSD();
                            var amountToAdd = 0;
                            var totalStarsGivenAmount = SYSTEM.totalStarsGiven;
                            // var totalStarsGivenAmount = await totalStarsGiven();
                            var percentUSDAmount = await percentUSD(Number(amount));
                            //percentUSD returns 1 if its value is 0
                            amountToAdd = percentUSDAmount * totalStarsGivenAmount;
                            if (totalStarsGiven == 0) {
                                amountToAdd = 100;
                            }
                            // await addStarsToUser(user, amountToAdd);
                            user.donationStars += amountToAdd;
                            // distributeStars(amountToAdd).catch(err => console.error("Error processing users:", err));
                            //calculate cut for platform
                            SYSTEM.platformAmount += Math.floor((amount * 0.55) - fee);
                            SYSTEM.userAmount += Math.floor(amount * 0.45);
                            await SYSTEM.save();
                        }
                    }
                } else {
                     console.log("Charge ID not found in session or payment intent.");
                }
            } catch (error) {
                 console.error("Error processing checkout.session.completed:", error);
                 return response.status(500).send(`Error processing event: ${error.message}`);
            }
        }
        //if subscription created or ended
        //update subscription data in db
        //...
        // For Subscriptions
        else if (event.type == "invoice.paid") {
            console.log(JSON.stringify(payload.data.object.subscription));
            var email = payload.data.object.customer_email;
            const invoice = event.data.object;
            var subscriber = await User.findOne({ email: email });
            var fee = 0;
             let chargeId = null;
              let paymentIntentId = null;

              // Determine if it was paid by a Charge or PaymentIntent
              if (invoice.charge) {
                chargeId = invoice.charge;
              } else if (invoice.payment_intent) {
                paymentIntentId = invoice.payment_intent;
              }

              if (chargeId) {
                try {
                  // Retrieve the Charge and expand its balance_transaction
                  const charge = await stripe.charges.retrieve(chargeId, {
                    expand: ['balance_transaction'] // IMPORTANT: expands the balance_transaction object
                  });

                  if (charge.balance_transaction) {
                    fee = charge.balance_transaction.fee; // Fee in cents (or smallest currency unit)
                    console.log("FEE:"+fee);
                  } else {
                    console.log('  Balance transaction not available on the Charge yet.');
                  }
                } catch (apiErr) {
                  console.error(`Error retrieving Charge ${chargeId}: ${apiErr.message}`);
                }
              } else if (paymentIntentId) {
                try {
                  // Retrieve the PaymentIntent
                  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

                  if (paymentIntent.latest_charge) {
                    // Retrieve the Charge and expand its balance_transaction
                    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge, {
                      expand: ['balance_transaction']
                    });

                    if (charge.balance_transaction) {
                      fee = charge.balance_transaction.fee;
                      console.log("FEE:"+fee);
                    } else {
                        console.log('  Balance transaction not available on the Charge yet.');
                    }
                  } else {
                    console.log('  No latest_charge found on PaymentIntent.');
                  }
                } catch (apiErr) {
                  console.error(`Error retrieving PaymentIntent ${paymentIntentId}: ${apiErr.message}`);
                }
              } else {
                console.log('  Invoice paid without an associated Charge or PaymentIntent (e.g., credit balance used).');
              }
            console.log("UNDER TEST");
            if (email != null) {
                console.log("OVER TEST");
                console.log(email);
                //they get stars
                //plus time bonus
                var subscriptionQuantity = 1;
                if (invoice.lines && invoice.lines.data) {
                    invoice.lines.data.forEach(lineItem => {
                      // Check if the line item is related to a subscription
                      if (lineItem.type === 'subscription' && lineItem.quantity) {
                        subscriptionQuantity = lineItem.quantity;
                      }
                    });
                  } else {
                    console.log('  No line items found on this invoice.');
                  }
                //if it's their first time subscriber notate it
                if(!subscriber.subscribed){
                    subscriber.lastSubscribed = new Date();
                }
                console.log("Subscription Quantity:"+subscriptionQuantity);
                subscriber.subscriptionQuantity = subscriptionQuantity;
                subscriber.subscriptionID = payload.data.object.subscription;
                subscriber.subscribed = true;
                subscriber.subscriptionPendingCancellation = false;
                // subscriber.lastSubscribed = new Date();
                let monthsSubscribed = monthDiff(subscriber.lastSubscribed, new Date());
                var subscriptionReward = (await percentUSD(500 * subscriber.subscriptionQuantity * 100 * (monthsSubscribed + 1))) * (await totalStarsGiven());
                // await addStarsToUser(subscriber, subscriptionReward);
                var amountToAdd = (await percentUSD(500 * subscriber.subscriptionQuantity * 100)) * (await totalStarsGiven());
                subscriber.donationStars += subscriptionReward;
                //calculate cut for platform
                var amount = 500 * subscriptionQuantity;
                SYSTEM.platformAmount += Math.floor((amount * 0.55) - fee);
                SYSTEM.userAmount += Math.floor(amount * 0.45);
                await SYSTEM.save();
                await subscriber.save();
                // distributeStars(amountToAdd).catch(err => console.error("Error processing users:", err));
            }
        } else if (event.type == "invoice.payment_failed") {
            var email = payload.data.object.customer_email;
            if (email != null) {
                var subscriber = await User.findOne({ email: email });
                subscriber.subscribed = false;
                user.subscriptionID = null;
                subscriber.lastSubscribed = null;
                await subscriber.save();
            }
        } else if (event.type == "customer.subscription.deleted") {
            const deletedSubscription = event.data.object;
            const customerId = deletedSubscription.customer;
            if (customerId) {
                try {
                  // Retrieve the Customer object using its ID
                  const customer = await stripe.customers.retrieve(customerId);
                  const customerEmail = customer.email;
                  if(customerEmail != null){
                    var subscriber = await User.findOne({ email: email });
                    if(subscriber.subscriptionPendingCancellation){
                        subscriber.subscribed = false;
                        user.subscriptionID = null;
                        subscriber.lastSubscribed = null;
                        await subscriber.save();
                    }
                    console.log("Subscription deleted.");
                  }
                } catch (apiErr) {
                  console.error(`Error retrieving Customer ${customerId}: ${apiErr.message}`);
                  // Handle cases where the customer might have been deleted or not found
                }
              } else {
                console.log('  No customer ID found on the deleted subscription.');
              }
        }

        else if (event.type === 'identity.verification_session.updated' || 
          event.type === 'identity.verification_session.created' ||
          event.type === 'identity.verification_session.completed' ||
          event.type === 'identity.verification_session.verified') {
        
        const verificationSession = event.data.object;
        
        // Update the verification session in our database
        await VerificationSession.updateOne(
          { stripeVerificationId: verificationSession.id },
          { 
            $set: { 
              status: verificationSession.status,
              lastUpdated: new Date()
            } 
          }
        );
        
        // If the verification is complete, process it for duplicate detection
        if (event.type === 'identity.verification_session.verified') {
          console.log("Beginning ID verification...");
          // Process verification and check for duplicates
          await processVerificationResult(verificationSession.id);
        }
      }else {
            console.log(event.type);
        }
        response.status(200).end();
    });
    async function distributeStars(amount) {
      const batchSize = 1000; // Adjust batch size as needed
      const cursor = await User.find({}).batchSize(batchSize);
      const updateOperations = []; // Initialize an array to hold update operations

      try {
        while (await cursor.hasNext()) {
          const user = await cursor.next(); // Get a single user object

          let stars = user.stars;
          let borrowedStars = user.borrowedStars || 0; // Ensure borrowedStars exists and is a number

          if(user.borrowedStars > 0){
                user.borrowedStars -= amount;
                var remainder = user.borrowedStars;
                if(remainder < 0){
                    stars -= remainder;
                }
                if(user.borrowedStars < 0){
                    user.borrowedStars = 0;
                }
            }else{
                stars += amount;
            }

          updateOperations.push({
            updateOne: {
              filter: { _id: user._id },
              update: { $set: { stars: stars } }
            }
          });

          // Execute bulkWrite when the batch is full or the cursor is exhausted
          if (updateOperations.length >= batchSize) {
            await db.users.bulkWrite(updateOperations, { ordered: false });
            updateOperations.length = 0; // Clear the array for the next batch
          }
        }

        // Process any remaining update operations after the loop
        if (updateOperations.length > 0) {
          await db.users.bulkWrite(updateOperations, { ordered: false });
        }

      } finally {
        await cursor.close();
      }
    }

    // Call the function with the desired amount
    // const amountToProcess = 5; // Example amount
    // distributeStars(amountToProcess).catch(err => console.error("Error processing users:", err));
    function canReceivePayouts(account){
      // Check if payouts are enabled
      if (account.payouts_enabled !== true) {
        return false;
      }

      // Check payout capability status
      if (account.capabilities && account.capabilities.transfers !== 'active') {
        return false;
      }

      // Check if payouts are restricted
      if (account.payouts_enabled === true && account.requirements) {
        // Check for requirements that would block payouts
        if (account.requirements.disabled_reason) {
          return false;
        }

        // Check for past due requirements
        if (account.requirements.past_due?.length > 0) {
          return false;
        }

        // Check for currently due requirements
        if (account.requirements.currently_due?.length > 0) {
          return false;
        }
      }

      return true;
    };
    app.post('/stripe_connect_webhook', bodyParser.raw({type: 'application/json'}), async (request, response) => {
        // response.header("Access-Control-Allow-Origin", "*");
        // response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        const SYSTEM = await System.findOne({});

        const endpointSecret = await accessSecret("STRIPE_ENDPOINT_CONNECT_SECRET_KEY");
        const payload = request.body;
      
        console.log("Got payload: " + payload);
        const sig = request.headers['stripe-signature'];
        let event;
        try {
            event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
            console.log(event.type);
        } catch (err) {
            console.log(err);
            //console.log(response.status(400).send(`Webhook Error: ${err.message}`));
            return;
            // return response.status(400).send(`Webhook Error: ${err.message}`);
        }
        switch (event.type) {
            case 'account.updated':
                const updatedAccount = event.data.object;
                var user = await User.findOne({email: updatedAccount.email});
                // Then define and call a function to handle the event account.updated
                var couldReceivePayouts = user.canReceivePayouts;
                user.canReceivePayouts = canReceivePayouts(updatedAccount);
                if(couldReceivePayouts && !user.canReceivePayouts){
                    SYSTEM.numUsersOnboarded -= 1;
                }
                else if(!couldReceivePayouts && user.canReceivePayouts && user.identityVerified){
                    SYSTEM.numUsersOnboarded += 1;
                }

                await user.save();
                await SYSTEM.save();
              break;
            // ... handle other event types
            default:
              console.log(`Unhandled event type ${event.type}`);
        }
        response.status(200).end();
      });
      function getStarsFromUSD(usd){
        return percentUSD(usd) * totalStarsGiven();
      }
    app.post('/unsubscribe', async function(req, res){
        try{
            if(req.session.user){
                var user = await User.findOne({_id: req.session.user._id});
                if(!user.subscribed){
                    return res.send("You're not subscribed yet!");
                }else{
                    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
                    const stripe = require("stripe")(STRIPE_SECRET_KEY);
                    const updatedSubscription = await stripe.subscriptions.update(
                      user.subscriptionID,
                      {
                        cancel_at_period_end: true,
                      }
                    );
                    user.subscriptionPendingCancellation = true;
                    await user.save();
                    req.session.user = user;
                    return res.send("Subscription canceled.");
                }
            }
            return res.send("Done.");
        }
        catch(error){
            return res.send("Error Unsubscribing. Please Contact us.");
        }
    });
    app.post('/create-subscription-checkout', async (req, res) => {
      const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
      const stripe = require("stripe")(STRIPE_SECRET_KEY);
      const userId = req.session.user._id; // Example: Assuming req.user contains user info
      const quantity = req.body.quantity;
      if(isNaN(quantity)){
        return res.send("Please enter a valid quantity.");
      }
      try {
        if(req.session.user.subscribed){
            console.log('ID '+req.session.user.subscriptionID);

            // await updateSubscriptionQuantityWithoutCredit(req.session.user.subscriptionID, quantity, req.session.user);
            // return res.send("Updated subscription.");
            return res.json({ okay: "Currently Subscribed. Unsubscribe by updating number to 0 first! (You will not lose your monthly star multiplier if you resubscribe before your last subscription ends)" });
          }
        const userEmail = req.session.user.email;
        if (!userEmail) {
          return res.status(400).json({ error: 'User email not found.' });
        }
        console.log(userEmail);
        let customer;
        const customerList = await stripe.customers.list({ email: userEmail });

        if (customerList.data.length > 0) {
          customer = customerList.data[0];
        } else {
          customer = await stripe.customers.create({
            email: userEmail,
            // Add other customer details if needed
          });
        }

        const session = await stripe.checkout.sessions.create({
          customer: customer.id,
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [
            {
              price: process.env.SUBSCRIPTION_PRICE_ID,
              quantity: quantity,
            },
          ],
          success_url: `${req.headers.origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`, // Adjust your success URL
          cancel_url: `${req.headers.origin}/subscription-cancel`, // Adjust your cancel URL
        });
        console.log(session.url);
        // Send the session URL back to the client for redirection
        return res.json({ url: session.url });

      } catch (error) {
        console.error('Error creating checkout session:', error);
        return res.status(500).json({ error: 'Failed to create checkout session.' });
      }
    });
    async function updateSubscriptionQuantityWithoutCredit(subscriptionId, newQuantity, user) {
      const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
      const stripe = require("stripe")(STRIPE_SECRET_KEY);
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
          proration_behavior: 'none', // Prevent proration and credits
          items: [{
            id: subscription.items.data[0].id, // Assuming only one item
            quantity: newQuantity,
          }],
        });

        return updatedSubscription;
        if(newQuantity == 0 || !user.subscribed){
            //reset subscription timer
            user.lastSubscribed = new Date();
            user.subscribed = true;
            await user.save();
        }else{

        }
      } catch (error) {
        console.error('Error updating subscription quantity without credit:', error);
        throw error;
      }
    }
    app.get('/subscription-success', async function(req, res){
        req.session.user.subscribed = true;
        return res.redirect("/donate");
    });
    app.get('/subscription-cancel', async function(req, res){
        return res.send("Canceled.");
    });
    // Example usage:
    // updateSubscriptionQuantityWithoutCredit('sub_xxxxxxxxxxxxx', 0)
    //   .then(updatedSubscription => console.log('Subscription updated (no credit):', updatedSubscription))
    //   .catch(error => console.error(error));
    app.get('/eval/:passage_id', async function(req, res){
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var passage_id = req.params.passage_id;
        var passage = await Passage.findOne({_id: passage_id});
        passage.all = '';
        // console.log(passage);
        //stick together code for all sub passages
        var all = {
            html: passage.html,
            css: passage.css,
            javascript: passage.javascript
        };
        if(passage.lang == 'daemon'){
            all.javascript = passage.code;
        }
        var userID = null;
        if(req.session.user){
            userID = req.session.user._id.toString();
        }
        all.javascript = DAEMONLIBS(passage, userID) + all.javascript;
        if(!passage.public){
            passage.code = DAEMONLIBS(passage, userID) + passage.code;
            passage = await getPassage(passage);
        }
        res.render("eval", {passage: passage, all: all});
    });
    async function concatObjectProps(passage, sub){
        sub = await bubbleUpAll(sub);
        // console.log(sub.code);
        if(sub.mimeType[0] != 'video' && sub.mimeType[0] != 'audio'){
            if(typeof passage.content != 'undefined')
            passage.displayContent += (typeof sub.displayContent == 'undefined' || sub.displayContent == '' ? '' : sub.displayContent);
            if(typeof passage.code != 'undefined')
                passage.displayCode += (typeof sub.displayCode == 'undefined' || sub.displayCode == '' ? '' : '\n' + sub.displayCode);
            if(typeof passage.html != 'undefined')
                passage.displayHTML += (typeof sub.displayHTML == 'undefined' || sub.displayHTML == '' ? '' : '\n' + sub.displayHTML);
            if(typeof passage.css != 'undefined')
                passage.displayCSS += (typeof sub.displayCSS == 'undefined' || sub.displayCSS == '' ? '' : '\n' + sub.displayCSS);
            if(typeof passage.javascript != 'undefined')
                passage.displayJavascript += (typeof sub.displayJavascript == 'undefined' || sub.displayJavascript == '' ? '' : '\n' + sub.displayJavascript);
        }
        for(var i = 0; i < sub.mimeType.length; ++i){
            if(sub.mimeType[i] == 'video'){
                var filename = sub.filename[i];
                // console.log((filename + '').split('.'));
                //`+passage.filename.split('.').at(-1)+`
                if(passage.video == ''){
                    var displayNone = '';
                }else{
                    var displayNone = 'style="display:none"';
                }
                passage.video += `
                <video class="uploadedVideo passage-file-`+sub._id+` passage-vid-`+sub.filename[i].split('.')[0]+` passage-video-`+passage._id+`"`+displayNone+`id="passage_video_`+sub._id+`"class="passage_video uploadedVideo"width="320" height="240" controls>
                    <source src="/`+getUploadFolder(sub)+`/`+sub.filename[i]+`" type="video/`+sub.filename[i].split('.').at(-1)+`">
                    Your browser does not support the video tag.
                </video>
                <script>
                    $('.passage-vid-`+sub.filename[i].split('.')[0]+`').on('ended', function(){
                        $(this).css('display', 'none');
                        $(this).next().next().css('display', 'block');
                        $(this).next().next().get(0).play();
                    });
                </script>
                `;
            }
            else if(sub.mimeType[i] == 'audio'){
                var filename = sub.filename[i];
                // console.log((filename + '').split('.'));
                //`+passage.filename.split('.').at(-1)+`
                if(passage.audio == ''){
                    var displayNone = '';
                }else{
                    var displayNone = 'style="display:none"';
                }
                passage.audio += `
                <audio `+displayNone+`id="passage_audio_`+sub._id+`"class="passage_audio passage-aud-`+sub.filename[i].split('.')[0]+`"width="320" height="240" controls>
                    <source src="/`+getUploadFolder(sub)+`/`+sub.filename[i]+`" type="audio/`+sub.filename[i].split('.').at(-1)+`">
                    Your browser does not support the audio tag.
                </audio>
                <script>
                    $('.passage-aud-`+sub.filename[i].split('.')[0]+`').on('ended', function(){
                        $(this).css('display', 'none');
                        $(this).next().next().css('display', 'block');
                        $(this).next().next().get(0).play();
                    });
                </script>
                `;
            }
            else if(sub.mimeType[i] == 'image'){
                passage.vidImages.push('/' + getUploadFolder(sub) + '/' + sub.filename[i]);
            }
        }
        // console.log(passage.video);
        // passage.sourceList = [...passage.sourceList, sub, ...sub.sourceList];
    }
    async function getAllSubData(passage){
        if(!passage.public && passage.passages && passage.bubbling){
            for(const p of passage.passages){
                if(typeof p == 'undefined'){
                    return p;
                }
                var b = p;
                if(p.showBestOf){
                    var best = await Passage.findOne({parent: p._id}, null, {sort: {stars: -1}});
                    b = best;
                }
                b.displayContent = p.content;
                b.displayCode = p.code;
                b.displayHTML = p.html;
                b.displayCSS = p.css;
                b.displayJavascript = p.javascript;
                if(b.lang == passage.lang){
                    await concatObjectProps(passage, await getAllSubData(b));
                }
            }
            // passage.passages.forEach((p)=>{
            //     if(typeof p == 'undefined'){
            //         return p;
            //     }
            //     p.displayContent = p.content;
            //     p.displayCode = p.code;
            //     p.displayHTML = p.html;
            //     p.displayCSS = p.css;
            //     p.displayJavascript = p.javascript;
            //     if(p.lang == passage.lang){
            //         concatObjectProps(passage, getAllSubData(p));
            //     }
            // });
        }
        // console.log(passage.title+passage.video);
        return passage;
    }
    async function bubbleUpAll(passage){
        // console.log(passage.passages);
        if(typeof passage == 'undefined'){
            return passage;
        }
        passage.video = '';
        passage.audio = '';
        passage.vidImages = [];
        for(var i = 0; i < passage.filename.length; ++i){
            if(passage.mimeType[i] == 'video'){
                passage.video += `
                <video id="passage_video_`+passage._id+`"class="passage_video uploadedVideo passage-video-`+passage._id+`"width="320" height="240" controls>
                    <source src="/`+getUploadFolder(passage)+`/`+passage.filename[i]+`" type="video/`+passage.filename[i].split('.').at(-1)+`">
                    Your browser does not support the video tag.
                </video>
                <script>
                    $('#passage_video_`+passage._id+`').on('ended', function(){
                        $(this).css('display', 'none');
                        $(this).parent().next().next().css('display', 'block');
                        $(this).parent().next().next().get(0).play();
                    });
                </script>
                `;
            }
            else if(passage.mimeType[i] == 'audio'){
                passage.audio += `
                <audio id="passage_audio_`+passage._id+`"class="passage_audio"width="320" height="240" controls>
                    <source src="/`+getUploadFolder(passage)+`/`+passage.filename[i]+`" type="audio/`+passage.filename[i].split('.').at(-1)+`">
                    Your browser does not support the audio tag.
                </audio>
                <script>
                    $('#passage_audio_`+passage._id+`').on('ended', function(){
                        $(this).css('display', 'none');
                        $(this).next().next().css('display', 'block');
                        $(this).next().next().get(0).play();
                    });
                </script>
                `;
            }
        }
        passage.displayContent = passage.content;
        passage.displayCode = passage.code;
        passage.displayHTML = passage.html;
        passage.displayCSS = passage.css;
        passage.displayJavascript = passage.javascript;
        if(!passage.bubbling){
            return passage;
        }
        if(!passage.public && !passage.forum){
            passage = await getAllSubData(passage);
            // return getAllSubData(passage);
        }
        // console.log('once'+passage.video);
        return passage;
    }
    function handleUntitled(title){
        return title == '' ? 'Untitled' : title;
    }
    function handlePassageLink(passage){
        return '<a href="/passage/'+handleUntitled(passage.title)+'/'+passage._id+'">'+handleUntitled(passage.title)+'</a>';
    }
    app.get('/passage/:passage_title/:passage_id/:page?', async function(req, res){
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var bigRes = await getBigPassage(req, res, true);
        // console.log('TEST'+bigRes.passage.title);
        // bigRes.passage = await fillUsedInListSingle(bigRes.passage);
        // console.log('TEST'+bigRes.passage.usedIn);
        if(!res.headersSent){
            // var location = ['test'];
            var location = await getPassageLocation(bigRes.passage);
            await getRecursiveSpecials(bigRes.passage);
            return res.render("stream", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title == '' ? 'Untitled' : bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
                ISMOBILE: bigRes.ISMOBILE,
                thread: false,
                page: 'more',
                whichPage: 'sub',
                location: location
            });
        }
    });
    async function getRecursiveSpecials(passage){
        var special = null;
        if(passage.showBestOf == true){
            special = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
            if(special != null)
            special = special._id;
        }
        if(passage.best != null){
            special = passage.best;
        }
        if(passage.repost != null){
            special = passage.repost;
        }
        if(passage.bestOf != null){
            special = passage.bestOf;
        }
        if(passage.mirror != null){
            special = passage.mirror;
        }
        if(special != null){
            special = await Passage.findOne({_id:special});
        }
        if(special == null){
            return null;
        }
        else{
            //because this is sometimes set by getPassage
            if(typeof passage.special == 'undefined'){
                passage.special = special;
            }
            await getRecursiveSpecials(special);
        }
    }
    app.post('/sticky', async (req, res) => {
        var passage = await Passage.findOne({_id: req.body._id});
        if(passage.stickied){
            passage.stickied = false;
        }
        else{
            passage.stickied = true;
        }
        await passage.save();
        return res.send("Done.");
    });
    app.get('/comments/:passage_title/:passage_id/:page?', async function(req, res){
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var bigRes = await getBigPassage(req, res, true, false, true);
        if(!bigRes){
            return res.redirect('/');
        }
        // console.log('TEST'+bigRes.passage.title);
        // bigRes.passage = await fillUsedInListSingle(bigRes.passage);
        // console.log('TEST'+bigRes.passage.usedIn);
        if(!res.headersSent){
            bigRes.subPassages = await fillUsedInList(bigRes.subPassages);
            var location = await getPassageLocation(bigRes.passage);
            await getRecursiveSpecials(bigRes.passage);
            res.render("stream", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
                ISMOBILE: bigRes.ISMOBILE,
                thread: false,
                page: 'more',
                whichPage: 'comments',
                location: location,
                comments: true
            });
        }
    });
    app.get('/subforums/:passage_title/:passage_id/:page?', async function(req, res){
        if(req.session.CESCONNECT){
            return getRemotePage(req, res);
        }
        var bigRes = await getBigPassage(req, res, true, true);
        if(!bigRes){
            return res.redirect('/');
        }
        // console.log('TEST'+bigRes.passage.title);
        // bigRes.passage = await fillUsedInListSingle(bigRes.passage);
        // console.log('TEST'+bigRes.passage.usedIn);
        if(!res.headersSent){
            bigRes.subPassages = await fillUsedInList(bigRes.subPassages);
            var location = await getPassageLocation(bigRes.passage);
            await getRecursiveSpecials(bigRes.passage);
            res.render("stream", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
                ISMOBILE: bigRes.ISMOBILE,
                thread: false,
                page: 'more',
                whichPage: 'subforums',
                location: location,
                subforums: true
            });
        }
    });
    app.get('/get_big_passage', async function(req, res){
        console.log(req.query._id);
        var bigRes = await getBigPassage(req, res);
        if(!bigRes){
            return res.redirect('/');
        }
        // console.log('TEST'+bigRes.passage.title);
        // bigRes.passage = await fillUsedInListSingle(bigRes.passage);
        // console.log('TEST'+bigRes.passage.usedIn);
        if(!res.headersSent){
            bigRes.subPassages = await fillUsedInList(bigRes.subPassages);
            var location = await getPassageLocation(bigRes.passage);
            await getRecursiveSpecials(bigRes.passage);
            res.render("passage", {subPassages: bigRes.subPassages, passageTitle: bigRes.passage.title, passageUsers: bigRes.passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: bigRes.passage, passages: false, totalPages: bigRes.totalPages, docsPerPage: DOCS_PER_PAGE,
                ISMOBILE: bigRes.ISMOBILE,
                thread: false,
                sub: true,
                page: 'more',
                whichPage: 'sub',
                location: location,
                subPassage: true
            });
        }
    });
    app.get('/stripeAuthorize', async function(req, res){
        if(req.session.user){
            // Generate a random string as `state` to protect from CSRF and include it in the session
            req.session.state = Math.random()
            .toString(36)
            .slice(2);
            var user = req.session.user;
            try {
                let accountId = user.stripeAccountId;
                let onboardingComplete = user.stripeOnboardingComplete;
                const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
                const stripe = require("stripe")(STRIPE_SECRET_KEY);
                // Create a Stripe account for this user if one does not exist already
                if (onboardingComplete === false) {
                    console.log("No Account yet.");
                    const account = await stripe.accounts.create({
                        type: 'express',
                        capabilities: {
                            transfers: {requested: true},
                        },
                      });
                    try{
                        await User.updateOne({_id: user._id}, {stripeAccountId: account.id});
                    }
                    catch(error){
                        console.error(error);
                    }
                    if(process.env.LOCAL){
                        var refresh_url = 'http://localhost:3000/stripeAuthorize';
                        var return_url = 'http://localhost:3000/stripeOnboarded';
                    }else{
                        var refresh_url = 'https://infinity-forum.org/stripeAuthorize';
                        var return_url = 'https://infinity-forum.org/stripeOnboarded';
                    }
                    // Create an account link for the user's Stripe account
                    const accountLink = await stripe.accountLinks.create({
                        account: account.id,
                        refresh_url: refresh_url,
                        return_url: return_url,
                        type: 'account_onboarding'
                    });
                    // console.log(accountLink);
                    // Redirect to Stripe to start the Express onboarding flow
                    res.redirect(accountLink.url);
                }
                else{
                    console.log("Already has account.");
                    let account = await User.findOne({_id: user._id});
                    console.log(account);
                    const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId);
                    res.redirect(loginLink.url);
                }
              } catch (err) {
                console.log('Failed to create a Stripe account.');
                console.log(err);
                // next(err);
              }
        }
    });
    app.get('/verify-identity', async(req, res) => {
        if(req.session.user){
            return res.render('verify-identity', {publishableKey: process.env.STRIPE_PUBLISHABLE_KEY});
        }else{
            return res.redirect('/loginform');
        }
    });
    app.post('/create-verification-session', async(req, res) => {
        if(req.session.user){
            // Set your secret key. Remember to switch to your live secret key in production.
            // See your keys here: https://dashboard.stripe.com/apikeys
            const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
            const stripe = require("stripe")(STRIPE_SECRET_KEY);

            // Check if user already has a pending or completed verification
            const existingVerification = await VerificationSession
              .findOne({
                userId: req.session.user._id.toString(),
                status: { $in: ['requires_input', 'processing', 'verified'] }
              });

            // If there's an active verification, return it instead of creating a new one
            if (existingVerification) {
              // Retrieve the verification details from Stripe
              const verificationSession = await stripe.identity.verificationSessions.retrieve(
                existingVerification.stripeVerificationId
              );
              return res.json({
                success: true,
                existingSession: true,
                url: verificationSession.url,
                clientSecret: verificationSession.client_secret,
                status: verificationSession.status
              });
            }

            // Create the session.
            const verificationSession = await stripe.identity.verificationSessions.create
            ({
              type
            : 'document',
              provided_details
            : {
                email
            : req.session.user.email,
              },
              metadata
            : {
                user_id: req.session.user._id.toString(),
              },
              options: {
                document: {
                  allowed_types: ['driving_license', 'passport', 'id_card'],
                  require_id_number: true,
                  require_live_capture: true,
                  require_matching_selfie: true
                }
                }
            });
            // Store session info in database
            await VerificationSession.create({
              userId: req.session.user._id.toString(),
              stripeVerificationId: verificationSession.id,
              status: verificationSession.status,
              created: new Date(),
              lastUpdated: new Date()
            });
            // Return the details needed for the frontend
            return res.json({
              success: true,
              url: verificationSession.url,
              clientSecret: verificationSession.client_secret
            });

            // Return only the client secret to the frontend.
            // const clientSecret = verificationSession.client_secret;
            // return res.status(200).json({ clientSecret: clientSecret });
        }else{
            return res.send("Error.");
        }
    });
    // Process verification result and check for duplicates
    async function processVerificationResult(verificationSessionId) {
      try {
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        const SYSTEM = await System.findOne({});
        // Retrieve the verification details from Stripe
        const verificationSession = await stripe.identity.verificationSessions.retrieve(
          verificationSessionId, 
          { expand: ['verified_outputs'] }
        );
        
        // Find our internal record for this verification
        const internalRecord = await VerificationSession
          .findOne({ stripeVerificationId: verificationSessionId });
        
        if (!internalRecord) {
          console.error('Verification record not found for session:', verificationSessionId);
          return;
        }
        
        // If verification was successful
        if (verificationSession.status === 'verified') {
          // Get document details (available in verified_outputs)
          const documentDetails = verificationSession.verified_outputs?.document?.dob ?
            {
              documentType: verificationSession.verified_outputs.document.type,
              documentNumber: verificationSession.verified_outputs.document.number,
              firstName: verificationSession.verified_outputs.document.first_name,
              lastName: verificationSession.verified_outputs.document.last_name,
              dob: verificationSession.verified_outputs.document.dob.day + 
                   '/' + verificationSession.verified_outputs.document.dob.month +
                   '/' + verificationSession.verified_outputs.document.dob.year,
              expiryDate: verificationSession.verified_outputs.document.expiration_date ?
                verificationSession.verified_outputs.document.expiration_date.day +
                '/' + verificationSession.verified_outputs.document.expiration_date.month +
                '/' + verificationSession.verified_outputs.document.expiration_date.year : null
            } : null;
          
          // Create a unique identifier based on document details
          const documentHash = await createDocumentHash(documentDetails);
          
          await VerificationSession.updateOne({
            userId: internalRecord.userId
          }, {$set: {
            documentHash: documentHash,
            documentType: documentDetails?.documentType,
            verifiedAt: new Date(),
            status: 'verified'
          }});
          console.log("Saved document hash.");
          // Check for duplicate documents across users
          const duplicateResults = await checkForDuplicateDocuments(documentHash, internalRecord.userId);
          
          if (duplicateResults.isDuplicate) {
            // Flag accounts for review
            // await flagDuplicateAccounts(internalRecord.userId, duplicateResults.existingUserIds);
            
            // Update session with duplicate info
            await VerificationSession.updateOne(
              { stripeVerificationId: verificationSessionId },
              { $set: { duplicateDetected: true } }
            );
          } else {
            // Update user's verification status
            await User.updateOne(
              { _id: internalRecord.userId },
              { 
                $set: { 
                  identityVerified: true,
                  verificationLevel: 'full',
                  lastVerifiedAt: new Date()
                } 
              }
            );
            var user = await User.findOne({_id: internalRecord.userId});
            user.stars += 100;
            if(user.stripeOnboardingComplete && user.stripeAccountId){
                const account = await stripe.account.retrieve(user.stripeAccountId);
                user.canReceivePayouts = canReceivePayouts(account);
                if(user.canReceivePayouts){
                    SYSTEM.numUsersOnboarded += 1;
                    await SYSTEM.save();
                }
            }
            await user.save();

          }
        }
      } catch (error) {
        console.error('Error processing verification result:', error);
      }
    }

    // Helper functions remain the same as in the previous example
    async function createDocumentHash(documentDetails) {
      if (!documentDetails) return null;
      
      // Create a deterministic string from key document fields
      const documentString = [
        documentDetails.documentType,
        documentDetails.documentNumber,
        documentDetails.firstName,
        documentDetails.lastName,
        documentDetails.dob
      ].join('|').toLowerCase();
      
      // Use a consistent salt for all hashing
      const staticSalt = await accessSecret('DOCUMENT_VERIFICATION_SALT');
      
      return new Promise((resolve, reject) => {
        crypto.scrypt(documentString, staticSalt, 64, (err, derivedKey) => {
          if (err) reject(err);
          resolve(derivedKey.toString('hex'));
        });
      });
    }

    async function checkForDuplicateDocuments(documentHash, currentUserId) {
      if (!documentHash) return { isDuplicate: false, existingUserIds: [] };
      
      // Find other users who have verified with this document
      const existingVerifications = await VerificationSession
        .find({ 
          documentHash,
          userId: { $ne: currentUserId } // Exclude current user
        })
        .toArray();
      
      const existingUserIds = existingVerifications.map(v => v.userId);
      
      return {
        isDuplicate: existingUserIds.length > 0,
        existingUserIds
      };
    }
    app.get('/recover', async(req, res) => {
        res.render('recover');
    });
    app.post('/recover', async(req, res) => {
        let user = await User.findOne({email: req.body.email});
        if(user != null){
            user.recoveryToken = v4();
            //expires in one hour
            user.recoveryExp = Date.now();
            user.recoveryExp = user.recoveryExp.setHours(user.recoveryExp.getHours() + 1);
            await user.save();
            await sendEmail(req.body.email, 'Recover Password: Infinity-Forum.org', 
            'Expires in one hour: https://infinity-forum.org/recoverpassword/'+user._id+'/'+user.recoveryToken);
            return res.render('recover_password', {token: null});
        }
        else{
            return res.send("No Such User Found.");
        }
    });
    app.get('/recoverpassword/:user_id/:token', async(req, res) => {
        let user = await User.findOne({_id: req.params.user_id});
        if(user && user.recoveryToken == req.params.token && (Date.now() < user.recoveryExp)){
            res.render("recover_password", {token: req.params.token, _id: user._id});
        }
        else{
            res.redirect('/');
        }
    });
    app.post('/recover_password', async(req, res) => {
        if(req.body.newPassword == req.body.confirm){
            var user = await User.findOne({_id: req.body._id});
            bcrypt.hash(req.body.confirm, 10, async function (err, hash){
                if (err) {
                  console.log(err);
                }
                user.password = hash;
                await user.save();
                req.session.user = user;
                res.redirect('/profile/'+ user.username + '/' + user._id);
              });
        }
    });
    //populate an array of objectIDs
    async function populateArray(arr, which){

    }
    app.get('/stripeOnboarded', async (req, res, next) => {
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        try {
            let user = await User.findOne({_id: req.session.user._id});
          // Retrieve the user's Stripe account and check if they have finished onboarding
          const account = await stripe.account.retrieve(user.stripeAccountId);
          if (account.details_submitted) {
            user.stripeOnboardingComplete = true;
            user.canReceivePayouts = canReceivePayouts(account);
            await user.save();
            const SYSTEM = await System.findOne({});
            if(user.identityVerified && user.canReceivePayouts){
                SYSTEM.numUsersOnboarded += 1;
            }
            await SYSTEM.save();
            res.redirect('/profile');
          } else {
            console.log('The onboarding process was not completed.');
            res.redirect('/profile');
          }
        } catch (err) {
          console.log('Failed to retrieve Stripe account information.');
          console.log(err);
          next(err);
        }
      });

    app.post('/login', async function(req, res) {
        //check if email has been verified
        var user = await authenticateUsername(req.body.username, req.body.password);
        if(user && !user.simulated){
            // Update last login time
            user.lastLogin = new Date();
            await user.save();
            req.session.user = user;
            return res.redirect('/profile/'+ user.username + '/' + user._id);
        }
        else{
            return res.redirect('/loginform');
        }
    });

    // Helper function to get a formatted date/time string for folder names
    function getFormattedDateTime() {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    }

    // Create a folder in Google Cloud Storage
    async function createGcsFolder(folderPath, bucketName) {
      try {
        // In GCS, folders are simulated by creating a 0-byte object with a trailing slash
        const folderObject = storage.bucket(bucketName).file(`${folderPath}/`);
        
        // Check if folder already exists
        const [exists] = await folderObject.exists();
        if (!exists) {
          // Create the folder by writing an empty file with folder metadata
          await folderObject.save('', {
            metadata: {
              contentType: 'application/x-directory'
            }
          });
          console.log(`Created GCS folder: ${folderPath}/`);
        } else {
          console.log(`GCS folder already exists: ${folderPath}/`);
        }
        
        return true;
      } catch (error) {
        console.error(`Error creating GCS folder ${folderPath}:`, error);
        throw error;
      }
    }

    // Helper function to determine content type based on file extension
    async function getContentType(filePath) {
      const fsp = require('fs').promises;
      try {
        const ext = path.extname(filePath).toLowerCase();

        // MIME types based on file extensions
        const extToMime = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.txt': 'text/plain',
          '.pdf': 'application/pdf',
          '.zip': 'application/zip',
          '.mp3': 'audio/mpeg',
          '.mp4': 'video/mp4',
          // Add more extensions as needed
        };

        if (extToMime[ext]) {
          return extToMime[ext];
        }

        // Magic number detection (for more accurate MIME type)
        try {
          const buffer = await fsp.readFile(filePath);
          const mime = magic(buffer);  // You'll need to ensure 'magic' is properly defined/imported

          if (mime) {
            return mime;
          }
        } catch (magicError) {
          console.error('Error with magic number detection:', magicError);
        }

        return 'application/octet-stream'; // Default if MIME type cannot be determined
      } catch (error) {
        console.error('Error determining content type:', error);
        return 'application/octet-stream'; // Default on error
      }
    }

    // Helper function to upload a file with retry logic
    async function uploadFileWithRetry(filePath, gcsFilePath, bucketName) {
      const { default: pRetry } = await import('p-retry');
      
      const operation = async () => {
        try {
          const contentType = await getContentType(filePath);
          const fileContent = await fsp.readFile(filePath);
          
          // Upload directly to GCS using the Storage client
          await storage.bucket(bucketName).file(gcsFilePath).save(fileContent, {
            contentType: contentType,
            metadata: {
              contentType: contentType
            }
          });
          
          console.log(`Uploaded to GCS path ${gcsFilePath} successfully.`);
          return true;
        } catch (error) {
          console.error(`Error during upload attempt for ${gcsFilePath}:`, error);
          throw error; // Throw to trigger retry
        }
      };
      
      return pRetry(operation, { 
        retries: 3, 
        onFailedAttempt: error => console.log(`Attempt ${error.attemptNumber} failed for ${gcsFilePath}. Retrying...`) 
      });
    }

    // Function to recursively process a directory and its subdirectories
    async function processDirectory(localDirPath, gcsFolderBase, bucketName, basePath = '') {
      const { default: pLimit } = await import('p-limit');
      const limit = pLimit(5); // Concurrency limit
      
      try {
        // Read the contents of the directory
        const entries = await fsp.readdir(path.join(localDirPath, basePath), { withFileTypes: true });
        const uploadPromises = [];
        
        // Process each entry (file or directory)
        for (const entry of entries) {
          const entryRelativePath = path.join(basePath, entry.name);
          const entryFullPath = path.join(localDirPath, entryRelativePath);
          
          if (entry.isDirectory()) {
            // Create the corresponding GCS subfolder
            const gcsSubfolderPath = `${gcsFolderBase}/${entryRelativePath}`;
            await createGcsFolder(gcsSubfolderPath, bucketName);
            
            // Recursively process subdirectory
            await processDirectory(localDirPath, gcsFolderBase, bucketName, entryRelativePath);
          } else if (entry.isFile()) {
            // Upload file with limited concurrency
            uploadPromises.push(limit(async () => {
              try {
                // Determine the GCS path for this file
                const gcsFilePath = `${gcsFolderBase}/${entryRelativePath}`;
                await uploadFileWithRetry(entryFullPath, gcsFilePath, bucketName);
              } catch (error) {
                console.error(`Error processing file ${entryRelativePath}:`, error);
              }
            }));
          }
        }
        
        // Wait for all file uploads at this level to complete
        await Promise.all(uploadPromises);
        
      } catch (error) {
        console.error(`Error processing directory ${path.join(localDirPath, basePath)}:`, error);
        throw error;
      }
    }

    // Main function to upload a directory and all its subdirectories to GCS
    async function uploadDirectoryToGCS(directoryPath, bucketName) {
      try {
        // Get directory name from path
        const dirName = path.basename(directoryPath);
        
        // Create GCS folder with directory name and timestamp
        const timestamp = getFormattedDateTime();
        const gcsFolderBase = `${dirName}_${timestamp}`;
        
        // Create the root GCS folder
        await createGcsFolder(gcsFolderBase, bucketName);
        
        console.log(`Starting upload of ${directoryPath} to GCS folder: ${gcsFolderBase}`);
        
        // Process the directory and all its subdirectories
        await processDirectory(directoryPath, gcsFolderBase, bucketName);
        
        console.log(`Finished processing directory: ${directoryPath} to GCS folder: ${gcsFolderBase}`);
        return true;
      } catch (error) {
        console.error('Error uploading files from directory:', error);
        throw error;
      }
    }

    // Route to trigger the GCS upload process
    app.get('/upload-to-gcs', requiresAdmin, async (req, res) => {
      if (!req.session.user || !req.session.user.admin) {
        return res.redirect('/');
      } else {
        try {
          const bucketName = 'infinity-forum-backup';
          
          const folderPath1 = path.join(__dirname, 'dump');
          const folderPath2 = path.join(__dirname, 'dist/uploads');
          const folderPath3 = path.join(__dirname, 'protected');
          
          // Upload directories in parallel
          await Promise.all([
            uploadDirectoryToGCS(folderPath1, bucketName),
            uploadDirectoryToGCS(folderPath2, bucketName),
            uploadDirectoryToGCS(folderPath3, bucketName)
          ]);
          
          return res.send('Backup process completed successfully.');
        } catch (error) {
          console.error('Error uploading to GCS:', error);
          res.status(500).send('Upload failed: ' + error.message);
        }
      }
    });

    /**
     * Downloads the most recent backup of a specified folder type from GCS
     * @param {string} bucketName - The name of the GCS bucket
     * @param {string} folderType - One of 'uploads', 'protected', or 'dump'
     * @param {string} localBaseDir - Base local directory (usually __dirname)
     * @param {boolean} deleteExisting - Whether to delete existing files before downloading
     * @returns {Promise<void>}
     */
    async function downloadMostRecentBackup(bucketName, folderType, localBaseDir, deleteExisting = false) {
      try {
        // Validate folder type
        if (!['uploads', 'protected', 'dump'].includes(folderType)) {
          throw new Error(`Invalid folder type: ${folderType}. Must be one of 'uploads', 'protected', or 'dump'`);
        }
        
        // Map local directories based on folder type
        const folderPaths = {
          'uploads': path.join(localBaseDir, 'dist/uploads'),
          'protected': path.join(localBaseDir, 'protected'),
          'dump': path.join(localBaseDir, 'dump')
        };
        
        const localDirectory = folderPaths[folderType];
        
        // Initialize the Google Cloud Storage client
        const storage = new Storage();
        
        // Get a reference to the bucket
        const bucket = storage.bucket(bucketName);
        
        // List all folders starting with the folderType
        const [files] = await bucket.getFiles({ prefix: `${folderType}_` });
        
        // Extract unique folder names
        const folderNames = new Set();
        files.forEach(file => {
          const folderName = file.name.split('/')[0];
          if (folderName.startsWith(`${folderType}_`)) {
            folderNames.add(folderName);
          }
        });
        
        // Convert to array and sort chronologically (newest first)
        const sortedFolders = Array.from(folderNames).sort().reverse();
        
        if (sortedFolders.length === 0) {
          console.log(`No backup folders found starting with "${folderType}_"`);
          return;
        }
        
        // Get the most recent folder
        const mostRecentFolder = sortedFolders[0];
        console.log(`Most recent backup folder: ${mostRecentFolder}`);
        
        // Get all files in the most recent folder
        const [folderFiles] = await bucket.getFiles({ prefix: `${mostRecentFolder}/` });
        
        // Delete existing directory if requested
        if (deleteExisting) {
          try {
            console.log(`Deleting existing directory: ${localDirectory}`);
            await fsp.rm(localDirectory, { recursive: true, force: true });
          } catch (err) {
            // If directory doesn't exist, that's fine
            if (err.code !== 'ENOENT') {
              console.warn(`Warning: Could not delete directory: ${err.message}`);
            }
          }
        }
        
        // Make sure the local directory exists
        await fsp.mkdir(localDirectory, { recursive: true });
        
        // Download each file
        console.log(`Downloading ${folderFiles.length} files to ${localDirectory}...`);
        
        // Set to track directories we've already created
        const createdDirs = new Set();
        createdDirs.add(localDirectory);
        
        for (const file of folderFiles) {
          // Skip the folder placeholder object (ends with '/')
          if (file.name.endsWith('/')) continue;
          
          // Get the file path without the folder prefix
          const relativePath = file.name.replace(`${mostRecentFolder}/`, '');
          const localFilePath = path.join(localDirectory, relativePath);
          
          // Create subdirectories if needed
          const dir = path.dirname(localFilePath);
          if (!createdDirs.has(dir)) {
            await fsp.mkdir(dir, { recursive: true });
            createdDirs.add(dir);
          }
          
          // Download the file
          await file.download({ destination: localFilePath });
          console.log(`Downloaded: ${relativePath}`);
        }
        
        console.log(`Download completed successfully for ${folderType}!`);
        
      } catch (error) {
        console.error(`Error downloading ${folderType} from GCS:`, error);
        throw error;
      }
    }

    /**
     * Download multiple folder types
     * @param {string} bucketName - The name of the GCS bucket
     * @param {Array<string>} folderTypes - Array of folder types to download ('uploads', 'protected', 'dump')
     * @param {string} localBaseDir - Base local directory
     * @param {boolean} deleteExisting - Whether to delete existing files before downloading
     * @returns {Promise<void>}
     */
    async function downloadMultipleFolders(bucketName, folderTypes, localBaseDir, deleteExisting = false) {
      for (const folderType of folderTypes) {
        console.log(`\n==== Processing ${folderType} ====`);
        await downloadMostRecentBackup(bucketName, folderType, localBaseDir, deleteExisting);
      }
      console.log('\nAll requested folders have been processed!');
    }

    // Example usage
    // const bucketName = 'infinity-forum-backup';
    // const localBaseDir = __dirname; // Or path.resolve('/your/base/path')

    // can also use await for these examples
    // Download a single folder type
    // downloadMostRecentBackup(bucketName, 'uploads', localBaseDir, true)
    //   .then(() => console.log('Process completed'))
    //   .catch(err => console.error('Process failed:', err));

    // Download all folder types
    // downloadMultipleFolders(bucketName, ['uploads', 'protected', 'dump'], localBaseDir, true)
    //   .then(() => console.log('All processes completed'))
    //   .catch(err => console.error('Process failed:', err));

    // Command line usage
    // async function main() {
    //   // Get command line arguments
    //   const args = process.argv.slice(2);
      
    //   if (args.length === 0) {
    //     console.log('Usage: node gcs-download.js <folder_type> [delete_existing]');
    //     console.log('  folder_type: "uploads", "protected", "dump", or "all"');
    //     console.log('  delete_existing: "true" or "false" (default: false)');
    //     console.log('\nExamples:');
    //     console.log('  node gcs-download.js uploads true');
    //     console.log('  node gcs-download.js all false');
    //     return;
    //   }
      
    //   const folderType = args[0].toLowerCase();
    //   const deleteExisting = args[1] === 'true';
      
    //   if (folderType === 'all') {
    //     await downloadMultipleFolders(bucketName, ['uploads', 'protected', 'dump'], localBaseDir, deleteExisting);
    //   } else if (['uploads', 'protected', 'dump'].includes(folderType)) {
    //     await downloadMostRecentBackup(bucketName, folderType, localBaseDir, deleteExisting);
    //   } else {
    //     console.error(`Invalid folder type: ${folderType}. Must be one of 'uploads', 'protected', 'dump', or 'all'`);
    //     process.exit(1);
    //   }
    // }

    // // Run if executed directly
    // if (require.main === module) {
    //   main()
    //     .then(() => console.log('Process completed successfully'))
    //     .catch(err => {
    //       console.error('Process failed:', err);
    //       process.exit(1);
    //     });
    // }

    // // Export functions for use in other modules
    // module.exports = {
    //   downloadMostRecentBackup,
    //   downloadMultipleFolders
    // };

    app.get('/dbbackup.zip', requiresAdmin, async (req, res) => {
        if(!req.session.user || !req.session.user.admin){
            return res.redirect('/');
        }
        exec("mongodump", async function(){
            // var directory1 = __dirname + '/dump';
            // var AdmZip = require("adm-zip");
            // const fsp = require('fs').promises;
            // var zip1 = new AdmZip();
            // var zip2 = new AdmZip();
            // //compress /dump and /dist/uploads then send
            // const files = await readdir(directory1);
            // for(const file of files){
            //     console.log(file);
            //     zip1.addLocalFolder(__dirname + '/dump/' + file);
            // }
            // return res.send(zip1.toBuffer());
            return res.send('Database backed up in /dump');
        });
    });
    function getZip(which){

    }
    app.get('/uploadsbackup.zip', requiresAdmin, async (req, res) => {
        if(!req.session.user || !req.session.user.admin){
            return res.redirect('/');
        }
        var directory1 = __dirname + '/dist/uploads';
        var AdmZip = require("adm-zip");
        const fsp = require('fs').promises;
        var zip1 = new AdmZip();
        //compress /dump and /dist/uploads then send
        const files = await readdir(directory1);
        for(const file of files){
            console.log(file);
            zip1.addLocalFile(__dirname + '/dist/uploads/' + file);
        }
        return res.send(zip1.toBuffer());
    });
    app.get('/protectedbackup.zip', requiresAdmin, async (req, res) => {
        if(!req.session.user || !req.session.user.admin){
            return res.redirect('/');
        }
        var directory1 = __dirname + '/protected';
        var AdmZip = require("adm-zip");
        const fsp = require('fs').promises;
        var zip1 = new AdmZip();
        //compress /dump and /dist/uploads then send
        const files = await readdir(directory1);
        for(const file of files){
            console.log(file);
            zip1.addLocalFile(__dirname + '/protected/' + file);
        }
        return res.send(zip1.toBuffer());
    });
    app.post('/restoredatabase', requiresAdmin, async (req, res) => {
        var AdmZip = require("adm-zip");
        const fsp = require('fs').promises;
        var files = req.files;
        // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
        var fileToUpload = req.files.file;
	    fileToUpload.mv('./tmp/db.zip', async function(err) {
    if (err) {
        console.error("Error moving uploaded file:", err);
        return res.status(500).send("Error uploading and processing file.");
    }

    try {
        const zip1 = new AdmZip(__dirname + '/tmp/db.zip');
        zip1.extractAllTo(__dirname + '/dump/sasame/');
        await fsp.rename(__dirname + "/dump/sasame/system.version.bson", __dirname + "/dump/admin/system.version.bson");
        await fsp.rename(__dirname + "/dump/sasame/system.version.metadata.json", __dirname + "/dump/admin/system.version.metadata.json");
        await fsp.unlink(__dirname + "/tmp/db.zip");
	var pwd = await accessSecret("MONGO_PASSWORD");
	let mongorestore;
	if (process.env.REMOTE == 'true') {
	    mongorestore = `mongorestore --username ${process.env.MONGO_USER} --password '${req.body.password}'`;
	} else {
	    mongorestore = 'mongorestore';
	}
        exec(`${mongorestore} --authenticationDatabase admin`, async function(error, stdout, stderr) {
            if (error) {
                console.error("Error during mongorestore:", error);
                return res.status(500).send("Error restoring database.");
            }
            console.log("mongorestore stdout:", stdout);
            console.error("mongorestore stderr:", stderr);
            return res.send("Database restored.");
        });
    } catch (error) {
        console.error("Error processing ZIP file:", error);
        // Handle the AdmZip or file system errors
        if (error.message === 'Invalid filename') {
            return res.status(400).send("Invalid ZIP file provided.");
        } else {
            return res.status(500).send("Error processing ZIP file.");
        }
    }
});
    });
    app.post('/restoreuploads', requiresAdmin, async (req, res) => {
	var AdmZip = require("adm-zip");
        try {
            // Check if files were uploaded
            if (!req.files || Object.keys(req.files).length === 0 || !req.files.file) {
                return res.status(400).send('No files were uploaded.');
            }
            
            const fileToUpload = req.files.file;
            const uploadPath = path.join(__dirname, 'tmp', 'uploads.zip');
            const extractPath = path.join(__dirname, 'dist', 'uploads');
            
            // Ensure the destination directory exists
            // await fs.mkdir(extractPath, { recursive: true });
            
            // Move the file
            await new Promise((resolve, reject) => {
                fileToUpload.mv(uploadPath, (err) => {
                    if (err) {
                        console.error("Error moving uploaded file:", err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // Process the ZIP file
            const zip1 = new AdmZip(uploadPath);
            zip1.extractAllTo(extractPath);
            await fsp.unlink(uploadPath);
            
            // Send response after all operations are complete
            res.send("Uploads restored.");
            
        } catch (error) {
            console.error("Error processing request:", error);
            // Only send response if one hasn't been sent already
            if (!res.headersSent) {
                res.status(500).send("An error occurred during the upload and restore process.");
            }
        }
    });
    app.post('/restoreprotected', requiresAdmin, async (req, res) => {
        var AdmZip = require("adm-zip");
        const fsp = require('fs').promises;
        var files = req.files;
        // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
        var fileToUpload = req.files.file;
        fileToUpload.mv('./tmp/protected.zip', async function(err) {
            var zip1 = new AdmZip(__dirname + '/tmp/protected.zip');
            zip1.extractAllTo(__dirname + '/protected/');
            await fsp.unlink(__dirname + "/tmp/protected.zip");
            return res.send("Protected Uploads restored.");
        });
    });
    app.get('/admin/:focus?/', requiresAdmin, async function(req, res){
        var focus = req.params.focus || false;
        // await mongoSnap('./backup/collections.tar'); // backup
        // await mongoSnap('./backups/collections.tar', true); // restore
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        if(!req.session.user || !req.session.user.admin){
            return res.redirect('/');
        }
        else{
            var whitelistOption = false;
            if(focus == 'requested-daemons' || focus == false){
                whitelistOption = false;
                //view all passages requesting to be a public daemon
                var passages = await Passage.find({public_daemon:1}).sort('-stars').populate('users author sourceList');
            }else if(focus == 'blacklisted'){
                whitelistOption = true;
                var blacklisted = [
                    "whatsapp", 'btn', 'tokopedia', 'gopay',
                    'dbs', 'call center', 'indodax'
                ];
                var passages = await Passage.aggregate([
                    {
                        $match: {
                            $or: [
                                { title: { $in: blacklisted } },
                                { content: { $in: blacklisted } }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: 'Users', // <--- Changed from 'users' to 'Users'
                            localField: 'author',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    {
                        $unwind: {
                            path: '$user',
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $match: {
                            $or: [
                                { 'user.whitelisted': { $ne: true } },
                                { user: { $exists: false } }
                            ]
                        }
                    },
                    {
                        $sort: { _id: -1 }
                    },
                    {
                        $project: {
                            user: 0
                        }
                    }
                ]);

            }
            let bookmarks = [];
            // if(req.session.user){
            //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
            // }
            if(req.session.user){
                bookmarks = getBookmarks(req.session.user);
            }
            passages = await fillUsedInList(passages);
            // bcrypt.hash('test', 10, function (err, hash){
            //     if (err) {
            //       console.log(err);
            //     }
            //     console.log(hash);
            //   });
            return res.render("admin", {
                subPassages: false,
                ISMOBILE: ISMOBILE,
                test: 'test',
                whitelistOption: whitelistOption,
                passageTitle: 'Infinity Forum', 
                scripts: scripts, 
                passages: passages, 
                passage: {id:'root', author: {
                    _id: 'root',
                    username: 'Sasame'
                }},
                bookmarks: bookmarks,

            });
        }
    });

    // Simulation Management Routes (Admin Only)
    app.get('/simulation', requiresAdmin, async (req, res) => {
        try {
            const ISMOBILE = browser(req.headers['user-agent']).mobile;
            res.render('simulation', {
                ISMOBILE: ISMOBILE,
                user: req.session.user,
                page: 'simulation',
                passageTitle: 'Simulation Management'
            });
        } catch (error) {
            console.error('Error loading simulation page:', error);
            res.status(500).send('Error loading simulation page');
        }
    });

    app.post('/generate-simulation', requiresAdmin, async (req, res) => {
        try {
            const { numUsers, numPassages, contentType, includeImages, includeSubContent } = req.body;
            const domain = process.env.DOMAIN || 'http://localhost:3000';
            
            // Import the fake data generator
            const fakeGenerator = require('./dist/js/fake.js');
            
            // Validate input
            if (!numUsers || !numPassages || numUsers < 1 || numPassages < 1) {
                return res.status(400).json({ error: 'Invalid parameters' });
            }
            
            if (numUsers > 50 || numPassages > 100) {
                return res.status(400).json({ error: 'Too many users or passages requested' });
            }
            
            console.log(`Admin ${req.session.user.username} requested simulation generation:`);
            console.log(`Users: ${numUsers}, Passages: ${numPassages}, Content: ${contentType}`);
            
            // Generate the fake data using HTTP registration for users and direct database creation for passages
            const useAIContent = contentType === 'ai';
            const includeImagesFlag = includeImages === true;
            const totalUsers = parseInt(numUsers);
            const totalPassages = parseInt(numPassages);
            
            console.log('Registering fake users via HTTP and creating passages directly in database...');
            
            // Generate fake users first using HTTP registration
            const createdUsers = [];
            for (let i = 0; i < totalUsers; i++) {
                console.log(`Registering fake user ${i + 1}/${totalUsers}...`);
                const fakeUserData = await fakeGenerator.registerFakeUser(domain);
                if (fakeUserData) {
                    createdUsers.push(fakeUserData);
                } else {
                    console.warn(`Failed to register fake user ${i + 1}, skipping...`);
                }
                // Small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            if (createdUsers.length === 0) {
                return res.status(500).json({ 
                    error: 'Failed to create any fake users via HTTP registration',
                    details: 'Check reCAPTCHA bypass or registration endpoint'
                });
            }
            
            console.log(`Successfully registered ${createdUsers.length} fake users via HTTP`);
            
            // Create passages for each user
            let createdPassagesCount = 0;
            const createdPassages = [];
            const passagesPerUser = Math.ceil(totalPassages / totalUsers);
            
            for (const userData of createdUsers) {
                for (let j = 0; j < passagesPerUser && createdPassagesCount < totalPassages; j++) {
                    const passage = await createFakePassageDirectly(userData, useAIContent, includeImagesFlag);
                    if (passage) {
                        createdPassagesCount++;
                        createdPassages.push(passage);
                    }
                }
            }
            
            // Create sub-passages if includeSubContent is true
            let totalSubPassagesCreated = 0;
            if (includeSubContent === true && createdPassages.length > 0) {
                console.log('Creating sub-passages for main passages...');
                
                for (const passage of createdPassages) {
                    const subPassages = await createFakeSubPassagesDirectly(passage, createdUsers, passage._id);
                    totalSubPassagesCreated += subPassages.length;
                }
                
                console.log(`Created ${totalSubPassagesCreated} sub-passages`);
            }
            
            console.log(`Completed: Registered ${createdUsers.length} users via HTTP, created ${createdPassagesCount} passages, and ${totalSubPassagesCreated} sub-passages`);
            
            res.json({
                success: true,
                usersCreated: createdUsers.length,
                passagesCreated: createdPassagesCount,
                subPassagesCreated: totalSubPassagesCreated,
                message: 'Simulation data generated successfully using HTTP registration for users and direct database creation for passages'
            });
            
        } catch (error) {
            console.error('Error generating simulation data:', error);
            res.status(500).json({ 
                error: 'Failed to generate simulation data',
                details: error.message 
            });
        }
    });

    // Simulated Passages View Route (Admin Only)
    app.get('/simulated-passages', requiresAdmin, async (req, res) => {
        try {
            const ISMOBILE = browser(req.headers['user-agent']).mobile;
            const { page = 1, sortBy = 'score', label = '', limit = 10 } = req.body;
            const skip = (page - 1) * limit;

            // Base query for simulated passages
            let query = {
                simulated: true,
                deleted: false,
                versionOf: null
            };

            // Add label filter if specified
            if (label && label !== '') {
                query.label = label;
            }

            // Get passages for scoring
            const passages = await Passage.find(query)
                .populate('author users sourceList')
                .limit(1000); // Get more for scoring, then paginate

            if (passages.length === 0) {
                return res.json({ passages: [], hasMore: false });
            }

            // Apply scoring algorithm (same as generateGuestFeed)
            const scoredPassages = await scoreSimulatedPassages(passages);

            // Sort based on sortBy parameter
            let sortedPassages;
            switch (sortBy) {
                case 'stars':
                    sortedPassages = scoredPassages.sort((a, b) => b.stars - a.stars);
                    break;
                case 'recent':
                    sortedPassages = scoredPassages.sort((a, b) => new Date(b.date) - new Date(a.date));
                    break;
                case 'comments':
                    sortedPassages = scoredPassages.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
                    break;
                case 'score':
                default:
                    sortedPassages = scoredPassages.sort((a, b) => b.score - a.score);
                    break;
            }

            // Paginate results
            const paginatedPassages = sortedPassages.slice(skip, skip + limit);
            const hasMore = skip + limit < sortedPassages.length;

            // Process passages for display
            const processedPassages = [];
            for (const passage of paginatedPassages) {
                const processedPassage = await getPassage(passage);
                console.log(processedPassage.starrers);
                console.log(passage.stars)
                processedPassages.push(processedPassage);
            }
            // res.render('simulated-passages', {
            //     ISMOBILE: ISMOBILE,
            //     user: req.session.user,
            //     page: 'simulated-passages',
            //     passageTitle: 'Simulated Passages'
            // });
            return res.render("stream", {
              subPassages: false,
              passageTitle: false, 
              scripts: scripts, 
              passages: processedPassages, 
              passage: {
                id: 'root', 
                author: {
                  _id: 'root',
                  username: 'Sasame'
                }
              },
              ISMOBILE: ISMOBILE,
              page: 'posts',
              whichPage: 'stream',
              thread: false,
            });
        } catch (error) {
            console.error('Error loading simulated passages page:', error);
            res.status(500).send('Error loading simulated passages page');
        }
    });

    // API endpoint for simulated passages with scoring
    app.post('/api/simulated-passages', requiresAdmin, async (req, res) => {
        try {
            const { page = 1, sortBy = 'score', label = '', limit = 10 } = req.body;
            const skip = (page - 1) * limit;

            // Base query for simulated passages
            let query = {
                simulated: true,
                deleted: false,
                versionOf: null
            };

            // Add label filter if specified
            if (label && label !== '') {
                query.label = label;
            }

            // Get passages for scoring
            const passages = await Passage.find(query)
                .populate('author users sourceList')
                .limit(1000); // Get more for scoring, then paginate

            if (passages.length === 0) {
                return res.json({ passages: [], hasMore: false });
            }

            // Apply scoring algorithm (same as generateGuestFeed)
            const scoredPassages = await scoreSimulatedPassages(passages);

            // Sort based on sortBy parameter
            let sortedPassages;
            switch (sortBy) {
                case 'stars':
                    sortedPassages = scoredPassages.sort((a, b) => b.stars - a.stars);
                    break;
                case 'recent':
                    sortedPassages = scoredPassages.sort((a, b) => new Date(b.date) - new Date(a.date));
                    break;
                case 'comments':
                    sortedPassages = scoredPassages.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
                    break;
                case 'score':
                default:
                    sortedPassages = scoredPassages.sort((a, b) => b.score - a.score);
                    break;
            }

            // Paginate results
            const paginatedPassages = sortedPassages.slice(skip, skip + limit);
            const hasMore = skip + limit < sortedPassages.length;

            // Process passages for display
            const processedPassages = [];
            for (const passage of paginatedPassages) {
                const processedPassage = await getPassage(passage);
                processedPassages.push(processedPassage);
            }

            res.json({
                passages: processedPassages,
                hasMore: hasMore,
                total: sortedPassages.length
            });

        } catch (error) {
            console.error('Error fetching simulated passages:', error);
            res.status(500).json({ error: 'Failed to fetch simulated passages' });
        }
    });

    // Scoring function for simulated passages (based on generateGuestFeed algorithm)
    async function scoreSimulatedPassages(passages) {
        const authorAppearances = {};
        const scoredPassages = [];

        for (const passage of passages) {
            // Calculate recency score
            const now = new Date();
            const passageDate = new Date(passage.date);
            const daysSinceCreation = (now - passageDate) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, Math.exp(-daysSinceCreation / 30)); // Decay over 30 days

            // Calculate other scores
            const starScore = Math.log10(passage.stars + 1) * 2;
            const commentScore = Math.log10((passage.comments?.length || 0) + 1) * 1.5;
            // Calculate usage score (how many times this passage is referenced)
            const usedByAuthors = await Passage.find({
                sourceList: { $in: [passage._id] },
                versionOf: null,
                author: { $ne: passage.author._id },
                simulated: false // Don't count simulated references
            }).distinct('author');
            const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;

            // Author diversity penalty
            const authorId = passage.author._id.toString();
            authorAppearances[authorId] = (authorAppearances[authorId] || 0) + 1;
            const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);

            // Add randomness
            const randomnessFactor = 0.7 + (Math.random() * 0.6);

            // Calculate final score (same weights as generateGuestFeed)
            const score = (
                (recencyScore * 0.3) +
                (starScore * 0.3) +
                (usedByScore * 0.2) +
                (commentScore * 0.2)
            ) * authorDiversityFactor * randomnessFactor;

            scoredPassages.push({
                ...passage.toObject(),
                score: score
            });
        }

        return scoredPassages;
    }

    async function addSource(req, passage, source, reason){
        if(req.session.user.admin || req.session.user.moderator){
            var suggestion = false;
            if((await isInCreativeChain(req.session.user._id, passage))){
                suggestion = true;
            }
            await Source.create({
                user: req.session.user._id.toString(),
                passage: passage._id,
                source: source._id,
                addedByReview: true,
                moderators: [req.session.user._id.toString()],
                votes: [1],
                reasons: [reason],
                suggested: suggestion,
                active: true
            });

        }
    }
    async function voteOnSource(req, source, vote, reason){
        source.moderators.push(req.session.user._id);
        source.votes.push(vote);
        source.reasons.push(reason);
        source.markModified('moderators');
        source.markModified('votes');
        source.markModified('reasons');
        if(source.votes.at(-1) === source.votes.at(-2) && 
            (
                (!source.suggested && source.votes.length > 3) 
                || 
                (source.suggested && source.votes.length > 4)
            )){
            if(source.votes.at(-1) === 1){
                source.hardActive = true;
            }else if(source.votes.at(-1) === -1){
                source.hardInActive = true;
                source.active = false;
            }
            var index = 0;
            for(const vote of votes){
                var user = await User.findOne({_id:source.moderators[index]._id.toString()});
                if(vote === source.votes.at(-1)){
                    user.modPoints += 1;
                    user.stars += 10;
                }else if(vote === -1 * source.votes.at(-1)){
                    user.modPoints -= 2;
                }
                await user.save();
            }
        }
        await source.save();
    }
    //are they a contributor?
    async function isInCreativeChain(user, passage){
        return await getContributors(passage).includes(user);
    }
    async function getContributors(passage){
        var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
        var contributors = sources.map(source => [source.author, ...source.contributors]);
        return contributors.flat();
    }
    async function userExists(email){
        var member = await User.findOne({email: email});
        if(member == null){
            return false;
        }
        return true;
    }
    app.post('/register/', async function(req, res) {
        if ((req.body.email ||
          req.body.username) &&
          req.body.password &&
          req.body.passwordConf && 
          req.body.password == req.body.passwordConf
          && req.body["g-recaptcha-response"]
          && !(await userExists(req.body.email))) {  

            var fake = req.body.fake || false;

            const name = req.body.name;
            if(process.env.REMOTE === 'true'){
                //handle recaptcha
                const response_key = req.body["g-recaptcha-response"];
                const secret_key = await accessSecret("RECAPTCHA_SECRET_KEY");
                const options = {
                url: `https://www.google.com/recaptcha/api/siteverify?secret=${secret_key}&response=${response_key}`,
                headers: { "Content-Type": "application/x-www-form-urlencoded", 'json': true }
                }
                try {
                const re = await request(options);
                if (!JSON.parse(re.body)['success']) {
                    return res.send({ response: "Failed" });
                }
                else{
                    console.log("SUCCESS");
                }
                // return res.send({ response: "Successful" });
                } catch (error) {
                    return res.send({ response: "Failed" });
                }
            }

            let numUsers = await User.countDocuments({username: req.body.username.trim()}) + 1;
            var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress 
            let ipNumber = ip.split('.').map(Number).reduce((a, b) => (a << 8) + b, 0);
            var userData = {
            name: req.body.username || req.body.email,
            username: req.body.username.split(' ').join('.') + '.' + numUsers || '',
            password: req.body.password,
            stars: 0,
            token: v4(),
            IP: ipNumber
            }  //use schema.create to insert data into the db
          if(req.body.email != ''){
            userData.email = req.body.email;
          }
          const { faker } = require('@faker-js/faker');
          if(fake){
            userData.about = faker.lorem.sentences(2);
            userData.thumbnail = faker.image.avatar();
            userData.simulated = true;
          }
          User.create(userData, async function (err, user) {
            if (err) {
              console.log(err);
            } else {
              req.session.user = user;
              //hash password
              bcrypt.hash(user.password, 10, function (err, hash){
                if (err) {
                  console.log(err);
                }
                user.password = hash;
                user.save();
              });
              //send verification email
              if(user.email && user.email.length > 1 && !fake){
                await sendEmail(user.email, 'Verify Email for Infinity Forum.', 
                    `
                        https://infinity-forum.org/verify/`+user._id+`/`+user.token+`
                    `);
              }
              res.redirect('/profile/');
            }
          });
        }
        else{
            res.redirect('/loginform');
        }
    });
    app.post('/update_settings/', async function(req, res) {
        if ((req.body.email ||
          req.body.name) &&
          req.body.password == req.body.passwordConf &&
          req.body.oldPassword) {  
            var user = await authenticateUsername(req.body.oldUsername, req.body.oldPassword);
            console.log(req.body.oldUsername + " : " + req.body.oldPassword);
            
            //for emergency reset during development
            // var profile = await User.findOne({username: req.body.oldUsername});
            // bcrypt.hash(req.body.oldPassword, 10, async function (err, hash){
            //     console.log(hash + ':' + profile.password);
            //     profile.password = hash;
            //     await profile.save();
            //   });

            if(user && !user.simulated){
                req.session.user = user;
                user.name = req.body.name;
                user.about = req.body.about;
                user.username = req.body.newUsername;
                user.safeMode = req.body['safe-mode'] && req.body['safe-mode'] == 'on' ? true : false;
                var sameEmail = await User.findOne({email: req.body.email});
                if(sameEmail._id.toString() != user._id.toString()){
                    return res.send("An Account with that email already exists.");
                }
                user.email = req.body.email;
                if(req.body.password.length > 0){
                    user.password = await bcrypt.hash(req.body.password, 10);
                }
                await user.save();
                req.session.user = user;
                return res.redirect('/profile/');
            }
            else{
                return res.send("Incorrect password.");
            }
        }
        else{
            return res.send("Must have an email, name, and fill in your current password. No changes made.");
        }
    });
    app.get('/logout', function(req, res) {
        if (req.session) {
            // delete session object
            req.session.destroy(function(err) {
              if(err) {
                return next(err);
              } else {
              }
            });
          }
        res.redirect('/');
    });
    async function deleteProfile(userID){
        //delete profile and all associated passages
        var user = await User.findOne({_id:userID});
        var passages = await Passage.find({author:user._id.toString()});
        for(const passage of passages){
            await deletePassage(passage);
        }
        await User.deleteOne({_id:user._id});

    }
    app.post('/delete-profile', async function(req, res) {
        if(req.session.user && req.session.user.admin){
            await deleteProfile(req.body._id);
            return res.send("Profile deleted.");
        }else{
            return res.send("Must be an admin");
        }
    });
    app.post('/paginate', async function(req, res) {
        try {
            var { page, profile, search = '', parent = 'root', whichPage, sort = 'Most Stars', label = 'All', from_ppe_queue } = req.body;
            // Handle standard passages
            let passages;
            if (!['filestream', 'messages', 'leaderboard'].includes(profile)) {
                let find = {
                    personal: false,
                    versionOf: null,
                    title: new RegExp(search, "i"),
                };
                
                // Add simulated filter based on request parameter
                if (req.body.simulated === 'true') {
                    find.simulated = true;
                } else {
                    find.simulated = false;
                };
                console.log("WHICH PAGE:"+whichPage);
                console.log(profile);
                switch(whichPage) {
                    case 'tasks':
                        find.public = true;
                        find.forum = false;
                        break;
                    case 'projects':
                        find.public = false;
                        find.forum = false;
                        break;
                    case 'personal':
                        find.personal = true;
                        find.users = { $in: [req.session.user._id] };
                        break;
                    case 'feed':
                        break;
                    case 'stream':
                        break;
                }
                if (parent !== 'root') find.parent = parent;
                if (profile !== 'false') find.author = profile;
                console.log(profile);
                console.log("TEST");
                if (from_ppe_queue) find.mimeType = 'image';
                if (label !== 'All') find.label = label;

                var sort_query = {stars: -1, _id: -1};
                const cursor = req.body.cursor || null;
                var result;
                switch(sort) {
                case 'Most Relevant':
                    //show by most stars if searching
                        if(search != ''){
                            sort = {stars: -1, _id: -1};
                        }else{
                            if(whichPage == 'stream'){
                             // Generate feed for guest users
                                result = await generateGuestFeed(page, limit);
                            }else if(whichPage == 'feed'){
                                result = await generateFeedWithPagination(req.session.user, page, limit);
                            }
                            passages = {};
                            passages.docs = [];
                            if('feed' in result){
                                for (let i = 0; i < result.feed.length; i++) {
                                  const processedPassage = await getPassage(result.feed[i]);
                                  passages.docs.push(processedPassage);
                                }
                            }else{
                                return res.send("No more passages.");
                            }
                        }
                        break;
                    case 'Most Stars':
                        sort_query = {stars: -1, _id: -1};
                        break;
                    case 'Most Cited':
                        result = await getPassagesByUsage({
                          cursor: cursor,
                          limit: 1,
                          minUsageCount: 2
                        });
                        var results = result.passages;
                        for(var i = 0; i < results.length; ++i){
                            results[i] = await fillUsedInList(results[i]);
                            results[i] = await getPassage(results[i]);
                        }
                        return res.render('passages', {
                                subPassages: false,
                                passages: results,
                                sub: true,
                                subPassage: false,
                                page: page,
                                cursor: result.nextCursor
                            });
                        break;
                    case 'Newest-Oldest':
                        sort_query = {date: -1};
                        console.log("NEWEST");
                        break;
                    case 'Oldest-Newest':
                        sort_query = {date: 1};
                        console.log("Oldest");
                        break;
                }

                try {
                    if(sort != 'Most Relevant'){
                        passages = await Passage.paginate(find, {
                            sort: sort_query, 
                            page: page, 
                            limit: DOCS_PER_PAGE, 
                            populate: 'author users parent sourceList'
                        });
                        // console.log("cursor:"+cursor);
                        // passages = await paginate(
                        //     Passage,
                        //     DOCS_PER_PAGE,
                        //     cursor ? JSON.parse(cursor) : null,
                        //     sort_query,
                        //     find
                        // );
                        // passages = {docs: passages};
                    }
                    
                } catch (err) {
                    console.error('Error in pagination:', err);
                    throw err;
                }

                // Process passages with error handling for each
                const processedPassages = [];
                for (let i = 0; i < passages.docs.length; i++) {
                    try {                        
                        // console.log("Passage.location:" + (await getPassageLocation(passages.docs[i])));

                        let passageWithUsedIn = await fillUsedInList(passages.docs[i]);
                        let processedPassage = await getPassage(passageWithUsedIn);
                        
                        if (processedPassage) {
                            processedPassages.push(processedPassage);
                        }
                    } catch (err) {
                        console.error(`Error processing passage ${passages.docs[i]._id}:`, err);
                        console.error('Problem passage data:', JSON.stringify(passages.docs[i], null, 2));
                        // Continue with next passage instead of crashing
                        continue;
                    }
                }

                console.log(`Successfully processed ${processedPassages.length} passages`);

                if (!from_ppe_queue) {
                    return res.render('passages', {
                        subPassages: false,
                        passages: processedPassages,
                        sub: true,
                        subPassage: false,
                        page: page
                    });
                } else {
                    return res.render('ppe_thumbnails', {
                        thumbnails: processedPassages,
                    });
                }
            }
            else if(profile == 'messages'){
                console.log('messages');
                let find = {
                    title: new RegExp(''+search+'', "i"),
                    to: req.session.user._id
                };
                var messages = await Message.paginate(find,
                {sort: '-stars', page: page, limit: DOCS_PER_PAGE, populate: 'author users passage'});
                passages = [];
                for(const message of messages.docs){
                    var p = await Passage.findOne({
                        _id: message.passage._id
                    }).populate('author users sourcelist');
                    passages.push(p);
                }
                for(var i = 0; i < passages.length; ++i){
                    passages[i] = await getPassage(passage);
                }
                res.render('passages', {
                    passages: passages,
                    subPassages: false,
                    sub: true,
                });
            }
            else if(profile == 'filestream'){
                console.log(profile);
            }
            else if(profile == 'leaderboard'){
                console.log("leaderboard!");
                let find = {
                    username: new RegExp(''+search+'', "i")
                };
                if(search == ''){
                    var rank = true;
                }
                else{
                    var rank = false;
                }
                console.log("LEADERBOARD PAGE:"+page);
                var limit = DOCS_PER_PAGE * 2;
                // limit = 2;
                let users = await User.paginate(find, {sort: "-starsGiven, _id", page: page, limit: limit});
                console.log(users.docs.length);
                res.render('leaders', {users: users.docs, page: page, rank: rank});
            }

        } catch (error) {
            console.error('Fatal error in pagination:', error);
            return res.status(500).json({ 
                error: 'Internal server error', 
                message: error.message,
                stack: process.env.LOCAL === 'true' ? error.stack : undefined
            });
        }
    });

    app.post(/\/delete_passage\/?/, async (req, res) => {
        var passage = await Passage.findOne({_id: req.body._id});
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("Only passage author can delete.");
        }
        if(passage.versionOf != null){
            return res.send("Not allowed.");
        }
        await deletePassage(passage);
        return res.send("Deleted.");
    });

    async function deletePassage(passage){
        //delete old versions
        await Passage.deleteMany({versionOf: passage});
        //delete uploads too
        for(const filename of passage.filename){
            //make sure no other passages are using the file
            var passages = await Passage.find({
                filename: {
                    $in: [filename]
                }
            });
            if(passages.length == 1){
                await deleteOldUploads(passage);
            }
        }
        var passages = await Passage.find({parent:passage._id});
        for(const p of passages){
            await deletePassage(p);
        }
        await Passage.deleteOne({_id: passage._id});
    }

    // app.use('/passage', passageRoutes);
    app.get('/passage_form/', (req, res) => {
        res.render('passage_form');
    });
    async function createPassage(user, parentPassageId, subforums=false, comments=false, customDate=null, simulated=false){
        let users = null;
        let parentId = null;
        var isRoot = parentPassageId == 'root';
        var parent;
        var personal = false;
        var fileStreamPath = null;
        var publicReply = false;
        if(user){
            users = [user];
        }
        if(isRoot){
            parentId = null;
        }
        else{
            parentId = parentPassageId;
            parent = await Passage.findOne({_id: parentId});
            if(parent.fileStreamPath != null && parent.fileStreamPath.slice(-1) == '/'){
                fileStreamPath = parent.fileStreamPath + 'Untitled';
            }
            personal = parent.personal;
            //by default additions should have the same userlist
            // if(user){
            //     if(parent.users.includes(user._id)){
            //         users = parent.users;
            //     }
            //     else{
            //         for(const u of parent.users){
            //             users.push(u);
            //         }
            //     }
            // }
            //can only add to private or personal if on the userlist or is a forum
            //or is a comment
            if(!comments && !parent.forum && !scripts.isPassageUser(user, parent) && (!parent.public || parent.personal)){
                return "Must be on userlist.";
                // return res.send("Must be on userlist.");
            }
            else if(parent.public_daemon == 2 || parent.default_daemon){
                // return res.send("Not allowed.");
                return "Not allowed."
            }
            publicReply = parent.public ? true : false;
        }
        var lang = 'rich';
        if(parent && parent.lang){
            lang = parent.lang;
        }
        var forum = false;
        if(parent && parent.forum){
            forum = parent.forum;
        }
        let passage = await Passage.create({
            author: user,
            users: users,
            parent: parentId,
            // forum: forum,
            lang: lang,
            fileStreamPath: fileStreamPath,
            personal: personal,
            lastUpdated: customDate && simulated ? customDate : Date.now(),
            date: customDate && simulated ? customDate : Date.now(),
            publicReply: publicReply,
            simulated: simulated || false
        });
        if(subforums == 'true'){
            passage.forumType = 'subforum';
            await passage.save();
        }
        if(!isRoot){
            //add passage to parent sub passage list
            if(subforums == 'true'){
                parent.subforums.push(passage);
                parent.markModified('subforums');
            }
            else if(comments == 'true'){
                // parent.comments.push(passage);
                // parent.markModified('comments');
            }
            else{
                console.log("pushed");
                if(!parent.public){
                    parent.passages.push(passage);
                    parent.markModified('passages');
                }
            }
            await parent.save();
        }
        let find = await Passage.findOne({_id: passage._id}).populate('author sourceList');
        return find;
    }
    app.post('/create_passage/', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        let user = req.session.user || null;
        var newPassage = await createPassage(user, req.body.passageID);
        res.render('passage', {subPassages: false, passage: newPassage, sub: true});
    });
    async function updatePassageFunc(){

    }
    // Rate limiter for create initial passage endpoint
    const intialPassageLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute window
      max: 20, // Limit each IP to 20 requests per windowMs
      message: 'Too many passages created, please try again after a minute.',
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });
    app.post('/create_initial_passage/', intialPassageLimiter, async (req, res) => {
        if(!req.session.user){
            return res.send("You must log in to create a passage.");
        }
        let user = req.session.user || null;
        var chief = req.body.chief;
        if(req.body['post-top'] && req.body['post-top'] == 'on'){
            chief = 'root';
        }
        //create passage
        var customDate = req.body.simulated === 'true' && req.body.date ? new Date(req.body.date) : null;
        var isSimulated = req.body.simulated === 'true';
        var newPassage = await createPassage(user, chief.toString(), req.body.subforums, req.body.comments, customDate, isSimulated);
        if(newPassage == 'Not allowed.' || newPassage == 'Must be on userlist.'){
            return res.send(newPassage);
        }
        //update passage
        var formData = req.body;
        var repost = req.body.repost == 'true' ? true : false;
        var repostID = req.body['repost-id'];
        var passage = await Passage.findOne({_id: newPassage._id}).populate('author users sourceList collaborators versions');
        passage.yt = formData.yt;
        if(repost){
            var reposted = await Passage.findOne({_id:repostID});
            passage.repost = repostID;
            console.log(repostID);
        }
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        else if(passage.public_daemon == 2 || passage.default_daemon){
            return res.send("Not allowed.");
        }
        switch(req.body.whichPage){
            case 'tasks':
                passage.public = true;
                break;
            case 'personal':
                passage.personal = true;
                break;
        }
        var parent = null;
        if(chief !== 'root'){
            parent = await Passage.findOne({_id:chief.toString()});
            // passage.forum = parent.forum;
            if(parent.forumType == 'category'){
                if(req.body.subforums != 'true'){
                    passage.forumType = 'subcat';
                }
                passage.forum = true;
            }
        }
        if(req.body.comments == 'true'){
            passage.comment = true;
            passage.forum = true;
            passage.label = "Comment";
        }
        if(req.body.comments != 'true'){
            passage.label = formData.label;
        }
        if(!labelOptions.includes(passage.label)){
            return res.send("Not an option.");
        }
        switch(passage.label){
            case 'Project':
            case 'Idea':
            case 'Database':
            case 'Article':
                passage.public = false;
                passage.forum = false;
                break;
            case 'Social':
            case 'Question':
            case 'Comment':
            case 'Task':
            case 'Challenge':
                passage.public = true;
                passage.forum = false;
                break;
            case 'Forum':
                passage.public = true;
                passage.forum = true;
                break;
            default:
                passage.public = false;
                passage.forum = false;

        }
        passage.html = formData.html;
        console.log("HTML"+ passage.html);
        passage.css = formData.css;
        passage.javascript = formData.js;
        passage.title = formData.title;
        passage.content = formData.content;
        passage.tags = formData.tags;
        passage.code = formData.code;
        passage.bibliography = formData.bibliography;
        passage.lang = formData.lang;
        passage.fileStreamPath = formData.filestreampath;
        passage.previewLink = formData['editor-preview'];
        if(parent != null && !passage.public && parent.author._id.toString() == req.session.user._id.toString()){
            if(parent.sameUsers){
                console.log("Same users");
                passage.users = parent.users;
            }
            if(parent.sameCollabers){
                console.log("Same collabers");
                passage.collaborators = parent.collaborators;
            }
            if(parent.sameSources){
                console.log("Same sources");
                passage.sourceList = parent.sourceList;
                passage.bibliography = parent.bibliography;
            }
        }
        //no longer synthetic if it has been edited
        passage.synthetic = false;
        var uploadTitle = '';
        if (!req.files || Object.keys(req.files).length === 0) {
            //no files uploaded
            console.log("No files uploaded.");
            passage.filename = passage.filename;
        }
        else{
            console.log('File uploaded');
            await uploadFile(req, res, passage);
        }
        await passage.save();
        //create notification if making a sub passage
        if(chief !== 'root'){
            for(const user of parent.watching){
                // if(parent.author != req.session.user)
                await Notification.create({
                    for: user,
                    about: req.session.user,
                    passage: passage,
                    content: '<a href="/profile/'+req.session.user.name+'">' + req.session.user.name + '</a> created "' + handlePassageLink(passage) + '" in "' + handlePassageLink(parent) + '"'
                });
            }
        }
        if(passage.mainFile && req.session.user.admin){
            //also update file and server
            updateFile(passage.fileStreamPath, passage.code);
        }
        await afterPassageCreation(newPassage);
        passage = await getPassage(passage);
        if(formData.page == 'stream'){
            return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage:true});
        }
        else if(formData.page == 'forum' && formData.which != 'thread'){
            console.log(req.body.chief);
            passage.numViews = await scripts.getNumViews(passage._id);
            if(passage.passages && passage.passages.length > 0){
                passage.lastPost = 'by ' + passage.passages.at(-1).author.name + '<br>' + passage.passages.at(-1).date.toLocaleDateString();
            }else{
                passage.lastPost = 'No Posts Yet.';
            }
            return res.render('cat_row', {subPassages: false, topic: passage, sub: true});
        }
        else{
            return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: true});
        }
    });
    app.post('/change_label', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        passage.label = req.body.label;
        if(!labelOptions.includes(passage.label)){
            return res.send("Not an option.");
        }
        switch(passage.label){
            case 'Project':
            case 'Idea':
            case 'Database':
            case 'Article':
                passage.public = false;
                passage.forum = false;
                break;
            case 'Social':
            case 'Question':
            case 'Comment':
            case 'Task':
            case 'Challenge':
                passage.public = true;
                passage.forum = false;
                break;
            case 'Forum':
                passage.public = true;
                passage.forum = true;
                break;

        }
        await passage.save();
        passage = await getPassage(passage);
        var subPassage = req.body.parent == 'root' ? false : true;
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
    });
    app.post('/show-bestof', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        console.log(req.body.checked);
        passage.showBestOf = req.body.checked;
        await passage.save();
        // passage = bubbleUpAll(passage);
        // passage = await fillUsedInListSingle(passage);
        // passage.location = await returnPassageLocation(passage);
        passage = await getPassage(passage);
        var subPassage = req.body.parent == 'root' ? false : true;
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
    });
    app.post('/same-users', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        passage.sameUsers = req.body.checked;
        await passage.save();
        return res.send("Complete.");
    });
    app.post('/same-collabers', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        passage.sameCollabers = req.body.checked;
        await passage.save();
        return res.send("Complete.");
    });
    app.post('/same-sources', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString()){
            return res.send("You can only update your own passages.");
        }
        passage.sameSources = req.body.checked;
        await passage.save();
        return res.send("Complete.");
    });
    app.post('/star_passage/', async (req, res) => {
        console.log('star_passage3');
        // return res.send('Not enough stars.');
        var passage_id = req.body.passage_id;
        var user = req.session.user;
        var amount = Number(req.body.amount);
        //get user from db
        let sessionUser = await User.findOne({_id: user._id});
        var subPassage = req.body.parent == 'root' ? false : true;
        if(req.session.user && user){
            if((sessionUser.stars + sessionUser.borrowedStars + sessionUser.donationStars) >= amount && process.env.REMOTE == 'true'){
                console.log("Before star passage");
                let passage = await starPassage(req, amount, req.body.passage_id, sessionUser._id, true);
                if(typeof passage === 'object' && passage !== null){
                    passage = await getPassage(passage);
                }
                else{
                    return res.send(passage);
                }
                passage.location = await returnPassageLocation(passage);
                return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
            }
            else if(process.env.REMOTE == 'false'){
                console.log("TESTING");
                let passage = await starPassage(req, amount, req.body.passage_id, sessionUser._id, true);
                await sessionUser.save();
                if(typeof passage === 'object' && passage !== null){
                    passage = await getPassage(passage);
                }
                else{
                    return res.send(passage);
                }
                passage.location = await returnPassageLocation(passage);
                return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
            }
            else{
                return res.send("Not enough stars!");
            }
        }
    });
    async function singleStarSources(user, sources, passage, reverse=false, justRecord=false, _session){
        for(const source of sources){
            // Skip if this source is the same as the main passage to avoid version conflicts
            if(source._id.toString() === passage._id.toString()){
                continue;
            }
            //check if starred already
            var recordSingle = await Star.findOne({user: user, passage:source, single:true, system:false}).session(_session);
            var recordSingleSystem = await Star.findOne({user: user, passage:source, single:true, system:true}).session(_session);
            //unstar if no previous record of being directly starred
            if(reverse && recordSingle == null){
                await Star.deleteOne({user: user, passage: source._id, single: true}).session(_session);
                source.stars -= 1;
                source.starrers = source.starrers.filter(u => {
                    return u != user;
                });
                await source.save({session: _session});
            }
            //star if hasnt been starred already
            else if(recordSingleSystem == null && recordSingle == null){
                if(!justRecord){
                    source.stars += 1;
                }
                source.starrers.push(user);
                var sources = await getRecursiveSourceList(source.sourceList, [], source);
                var star = await Star.create([{
                    user: user,
                    passage: source,
                    amount: 1,
                    sources: sources,
                    single: true,
                    system: true
                }], {session: _session});
                await source.save({session: _session});
            }
        }
    }
    async function singleStarPassage(req, passage, reverse=false, isSub=false, initialSession=null){
        let _session = initialSession;
        let shouldEndSession = false;
        if (_session === null) {
            _session = await mongoose.startSession();
            shouldEndSession = true;
        }
        
        try {
            let passageResult = null;
            
            // Define the transaction logic as a separate function
            const transactionLogic = async () => {
                var user = req.session.user._id.toString();
                var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
                //check if starred already
                var recordSingle = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:false}).session(_session);
                var recordSingleSystem = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:true}).session(_session);
                if(!reverse){
                    //star mirror best and bestof and repost
                    //and add to sources
                    if(passage.showBestOf){
                        var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).session(_session);
                        if(best != null){
                            sources.push(best);
                        }
                    }
                    else{
                        try{
                            var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums').session(_session);
                            if(mirror != null)
                            sources.push(mirror);
                        }
                        catch(e){
                        }
                        try{
                            var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums').session(_session);
                            if(bestOf != null)
                                sources.push(bestOf);
                        }
                        catch(e){
                        }
                    }
                    //star if hasn't been starred already
                    if((recordSingleSystem == null && recordSingle == null) || !isSub){
                        var system = isSub ? true : false;
                        //check if starred before by starPassage
                        var starredBefore = await Star.findOne({user: req.session.user._id.toString(), passage: passage._id, fromSingle: true}).session(_session);
                        //star each source recursively
                        //if user is verified and numVerifiedStars > lastCap give the passage a user star
                        if(req.session.user.identityVerified && !starredBefore/*(passage.verifiedStars + 1) > passage.lastCap*/){
                            // Call starPassage without starting a new transaction since we're already in one
                            let starResult = await starPassage(req, 1, passage._id, req.session.user._id.toString(), true, true, _session);
                            if(starResult && typeof starResult === 'object'){
                                passage = starResult;
                            }
                            //in the future maybe make sure we hard star new sources (TODO)
                            await singleStarSources(user, sources, passage, false, true, _session);
                        }
                        else{
                            //just add a star to passage but not collabers
                            passage.stars += 1;
                            await singleStarSources(user, sources, passage, false, false, _session);
                        }
                        // Check if passage is valid before accessing starrers
                        if(passage && passage.starrers){
                            passage.starrers.push(user);
                        } else {
                            console.error("Passage or passage.starrers is null/undefined:", passage);
                            throw new Error("Invalid passage object");
                        }
                        console.log(passage.starrers);
                        var star = await Star.create([{
                            user: req.session.user._id,
                            passage: passage._id,
                            amount: 1,
                            sources: sources,
                            single: true,
                            system: system
                        }], {session: _session});
                    }
                    //if bubbling star all sub passages (content is displayed in parent)
                    if(passage.bubbling && passage.passages && !passage.public){
                        for(const p of passage.passages){
                            //also star sources for each sub passage
                            passage.sourceList = [...passage.sourceList, ...p.sourceList];
                            await singleStarPassage(req, p, false, true, _session);
                        }
                    }
                }
                else{
                    if(passage.starrers.includes(user)){
                        // recordSingle = await Star.findOne({user: user._id, passage:passage, single:true, system:false});
                        //unstar if no previous record of being directly starred or isnt a sub passage
                        if((recordSingle == null && recordSingleSystem != null) || !isSub){
                            var record = await Star.findOne({user: req.session.user._id, passage:passage._id, single:true, system:false}).session(_session);
                            await singleStarSources(user, sources, passage, true, false, _session);
                            passage.stars -= 1;
                            if(req.session.user.identityVerified){
                                passage.verifiedStars -= 1;
                            }
                            passage.starrers = passage.starrers.filter(u => {
                                return u != user;
                            });
                            await Star.deleteOne({user: user, passage: passage._id, single: true}).session(_session);
                        }

                        //if bubbling unstar all sub passages (content is displayed in parent)
                        if(passage.bubbling && passage.passages && !passage.public){
                            for(const p of passage.passages){
                                //also star sources for each sub passage
                                passage.sourceList = [...passage.sourceList, ...p.sourceList];
                                await singleStarPassage(req, p, true, true, _session);
                            }
                        }
                    }
                }
                passage.markModified("starrers");
                await passage.save({session: _session});
                passage = await getPassage(passage);
                passageResult = passage;
            };
            
            // Execute transaction logic - use withTransaction only if we created the session
            if (shouldEndSession) {
                // We created the session, so we need to manage the transaction
                await _session.withTransaction(transactionLogic);
            } else {
                // Session was passed in, so we're already in a transaction
                await transactionLogic();
            }
            
            console.log("singleStarPassage transaction result:", passageResult);
            return passageResult;
        } catch (err) {
            console.error('Transaction failed in singleStarPassage:', err);
            return null; // Return null instead of throwing error for consistency
        } finally {
            if (shouldEndSession) {
                _session.endSession();
            }
        }
    }
    app.post('/single_star/', async (req, res) => {
        var user = req.session.user._id.toString();
        if(req.session && req.session.user){
            var p = await Passage.findOne({_id: req.body._id});
            console.log(p.starrers.includes(user));
            //whether we are giving a star or taking it away
            if(req.body.on == 'false' && !p.starrers.includes(user)){
                var passage = await singleStarPassage(req, p, false, false, null);
            }
            else if(req.body.on == 'true'){
                var passage = await singleStarPassage(req, p, true, false, null);
            }
            else{
                console.log("WHAT");
            }
            console.log(passage);
            return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: true});
        }
        else{
            return res.render("Must be logged in.");
        }
    });
    app.post('/repost/', async (req, res) => {
        if(req.session && req.session.user){
            
        }
        else{
            return res.render("Must be logged in.");
        }
    });
    app.post('/update_passage_order/', async (req, res) => {
        let passage = await Passage.findOne({_id: req.body._id});
        // console.log(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString());
        //Only for private passages
        if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            var passageOrder = [];
            if(typeof req.body.passageOrder != 'undefined'){
                var passageOrder = JSON.parse(req.body.passageOrder);
                let trimmedPassageOrder = passageOrder.map(str => str.trim());
                console.log(trimmedPassageOrder);
                // console.log(passage.passages[0]._id+'  '+ passage.passages[1]._id+ '  '+passage.passages[2]._id);
                passage.passages = trimmedPassageOrder;
                passage.markModified('passages');
                await passage.save();
            }
            // console.log(passageOrder);
        }
        //give back updated passage
        res.send('Done');
    });
    app.post('/ppe_add', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var uploadTitle = v4();
        var data = req.body.dataURL.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(data, 'base64');
        const fsp = require('fs').promises;
        await fsp.writeFile('./dist/uploads/'+uploadTitle, buf);
        console.log(req.body.sourceList);
        let passage = await Passage.create({
            author: req.session.user,
            users: [req.session.user],
            parent: req.body.parent == 'root' ? null: req.body.parent,
            filename: uploadTitle,
            sourceList: JSON.parse(req.body.sourceList),
            mimeType: 'image'
        });
        var newOne = await Passage.find({_id: passage._id});
        console.log(req.body.parent);
        if(req.body.parent !== 'root'){
            let parent = await Passage.findOne({_id: req.body.parent});
            parent.passages.push(newOne);
            await parent.save();
        }
        let find = await Passage.findOne({_id: passage._id});
        res.render('ppe_thumbnail', {thumbnail: find});
    });
    app.get('/ppe_queue', async (req, res) => {
        let passages = await Passage.find({
            parent: req.query.parent == 'root' ? null : req.query.parent,
            mimeType: 'image'
        }).sort('-stars');
        return res.render('ppe_thumbnails', {thumbnails: passages});
    });
    app.get('/three', async (req, res) => {
        res.render('three');
    });
    async function getModels(data, parent=null){
        var find = {
            mimeType: 'model',
            parent: parent,
            title: {
                $regex: data.query,
                $options: 'i',
            }
        };
        let models = await Passage.paginate(find, {
            page: data.page,
            limit: DOCS_PER_PAGE,
            populate: 'author',
            sort: '-stars'
        });
        return models.docs;
    }
    app.get('/models', async (req, res) => {
        var models = await getModels(req.query);
        res.send(models);
    });

    app.get('/models/:title/:_id', async (req, res) => {
        var model = await Passage.findOne({_id: req.params._id});
        var models = await getModels(req.query, model._id);
        res.send(models);
    });
    async function getSVGs(data){
        var find = {
            mimeType: 'image',
            isSVG: true,
            title: {
                $regex: data.query,
                $options: 'i',
            }
        };
        let svgs = await Passage.paginate(find, {
            page: data.page,
            limit: DOCS_PER_PAGE,
            populate: 'author',
            sort: '-stars'
        });
        return svgs.docs;
    }
    app.get('/svgs', async (req, res) => {
        var svgs = await getSVGs(req.query);
        res.send(svgs);
    });
    app.post('/upload_svg', async (req, res) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let obj = {};
        let search = '';
        if(req.body.username.match(regex) === null){
            //it's a username
            search = "username";
        }
        else{
            //it's an email
            search = "email";
        }
        obj[search] = req.body.username;
        User.findOne(obj)
          .exec(function (err, user) {
            if (err) {
              return callback(err)
            } else if (!user) {
              var err = new Error('User not found.');
              err.status = 401;
              return res.send("User not found.");
            }
            bcrypt.compare(req.body.password, user.password, async function (err, result) {
              if (result === true) {
                var fileToUpload = req.files.file;
                var uploadTitle = v4() + "." + fileToUpload.name.split('.').at(-1);
                fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
                    if (err){
                        return res.status(500).send(err);
                    }
                });
                var passage = await Passage.create({
                    sourceList: req.body.sources,
                    author: user._id,
                    title: req.body.title,
                    mimeType: 'model',
                    filename: uploadTitle,
                    thumbnail: null,
                    isSVG: true
                });
                return res.send("Done");
              } else {
                return res.send("Wrong Credentials.");
              }
            })
          });
    });
    app.post('/update_thumbnail', async (req, res) => {
        var data = req.body.thumbnail.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(data, 'base64');
        const fsp = require('fs').promises;
        var thumbnailTitle = v4() + ".png";
        await fsp.writeFile('./dist/uploads/'+thumbnailTitle, buf);
        await Passage.findOneAndUpdate({_id: req.body.passageID}, {
            $set: {
                thumbnail: thumbnailTitle
            }
        });
        res.send("Done");
    });

    //for API :: blender add-on
    app.post('/upload_model', async (req, res) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let obj = {};
        let search = '';
        var user = await authenticateUsername(req.body.username, req.body.password);
        if(user){
            var fileToUpload = req.files.file;
            var uploadTitle = v4() + "." + fileToUpload.name.split('.').at(-1);
            fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
                if (err){
                    return res.status(500).send(err);
                }
            });
            var passage = await Passage.create({
                sourceList: req.body.sources,
                author: user._id,
                title: req.body.title,
                mimeType: 'model',
                filename: uploadTitle,
                thumbnail: null
            });
            return res.send("Done");
        }
        else{
            return res.send("Wrong Credentials.");
        }
    });
    app.post('/update_metadata', async (req, res) => {
        var passage = await Passage.findOne({_id: req.body._id});
        if(req.session.user && passage.author._id.toString() == req.session.user._id.toString()){
            passage.metadata = req.body.metadata;
            await passage.save();
        }
    });
    //temp function for external api (mostly to work with metadata)
    app.post('/passage_update', async (req, res) => {
        var passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList collaborators versions');
        if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            return res.send(await updatePassage(req.body._id, req.body.attributes));
        }
    });
    //attributes is an object
    //temp for external api
    async function updatePassage(_id, attributes){
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        const keys = Object.keys(attributes);
        keys.forEach((key, index) => {
            passage[key] = attributes[key];
        });
        await passage.save();
        return 'Done';
    }
    app.post('/change_profile_picture/', async (req, res) => {
        await uploadProfilePhoto(req, res);
        res.redirect("/profile");
    });
    app.post('/update_passage/', async (req, res) => {
        if(!req.session.user){
            return res.send("Not logged in.");
        }
        var _id = req.body._id;
        var formData = req.body;
        var subforums = formData.subforums;
        var passage = await Passage.findOne({_id: _id}).populate('author users sourceList collaborators versions');
        if(passage.author._id.toString() != req.session.user._id.toString() && !req.session.user.admin){
            return res.send("You can only update your own passages.");
        }
        else if(passage.public_daemon == 2 || passage.default_daemon){
            return res.send("Not allowed.");
        }
        if(passage.versionOf != null){
            return res.send("Not allowed.");
        }
        //if the passage has changed (formdata vs passage)
        //save the old version in a new passage
        if(formData.html != passage.html || formData.css != passage.css || formData.javascript
            != passage.javascript || formData.code != passage.code || formData.content
            != passage.content){
            var oldVersion = await Passage.create({
                parent: null,
                author: passage.author,
                date: passage.updated,
                versionOf: passage._id,
                users: passage.users,
                sourceList: passage.sourceList,
                title: passage.title,
                content: passage.content,
                html: passage.html,
                css: passage.css,
                javascript: passage.javascript,
                filename: passage.filename,
                code: passage.code,
                lang: passage.lang,
                isSVG: passage.isSVG,
                license: passage.license,
                mimeType: passage.mimeType,
                thumbnail: passage.thumbnail,
                metadata: passage.metadata,
                sourceLink: passage.sourceLink,
                personal: passage.personal,
                synthetic: false,
                mirror: passage.mirror,
                bestOf: passage.bestOf,
                mirrorEntire: passage.mirrorEntire,
                mirrorContent: passage.mirrorContent,
                bestOfEntire: passage.bestOfEntire,
                bestOfContent: passage.bestOfContent,
                public: passage.public,
                forum: passage.forum,
                previewLink: passage.previewLink,
                yt: passage.yt
            });
            //now add to versions of new passage
            passage.versions.push(oldVersion);
        }
        // console.log('test');
        passage.yt = formData.yt;
        passage.html = formData.html;
        passage.css = formData.css;
        passage.javascript = formData.js;
        passage.title = formData.title;
        passage.content = formData.content;
        passage.tags = formData.tags;
        passage.code = formData.code;
        passage.bibliography = formData.bibliography;
        passage.lang = formData.lang;
        passage.fileStreamPath = formData.filestreampath;
        passage.previewLink = formData['editor-preview'];
        //no longer synthetic if it has been edited
        passage.synthetic = false;
        passage.lastUpdated = Date.now();
        var uploadTitle = '';
        if (!req.files || Object.keys(req.files).length === 0) {
            //no files uploaded
            console.log("No files uploaded.");
            passage.filename = passage.filename;
        }
        else{
            console.log('File uploaded');
            await uploadFile(req, res, passage);
        }
        if(subforums == 'true'){
            console.log(3);
        }
        // console.log("INFO: " + subforums);
        //Only for private passages
        if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
            var passageOrder = [];
            if(req.body.passageOrder != 'false' && req.body.isChief != 'false'){
                var passageOrder = JSON.parse(req.body.passageOrder);
                let trimmedPassageOrder = passageOrder.map(str => str.trim());
                console.log(trimmedPassageOrder);
                // console.log(passage.passages[0]._id+'  '+ passage.passages[1]._id+ '  '+passage.passages[2]._id);
                if(subforums == 'true'){
                    console.log(2);
                    passage.subforums = trimmedPassageOrder;
                    passage.markModified('subforums');
                }
                else{
                    passage.passages = trimmedPassageOrder;
                    passage.markModified('passages');
                }
            }
            // console.log(passageOrder);
        }
        passage.markModified('versions');
        await passage.save();
        if(passage.mainFile && req.session.user.admin){
            //also update file and server
            // updateFile(passage.fileStreamPath, passage.code);
        }
        passage = await getPassage(passage);
        var subPassage = formData.parent == 'root' ? false : true;
        //give back updated passage
        return res.render('passage', {subPassages: false, passage: passage, sub: true, subPassage: subPassage});
    });
    function removeHTMLTags(str) {
      return str.replace(/<[^>]*>/g, ' ');
    }
    app.get('/preview-link', async (req, res) => {
      const text = req.query.url;
      // console.log(removeHTMLTags(text));
      if (!text) {
        return res.status(400).send('Please provide a URL in the "url" query parameter.');
      }
      try {
        const dns = require("node:dns");
        console.log("URL:");
        console.log(removeHTMLTags(text));
        const data = await linkPreview.getLinkPreview(removeHTMLTags(text), {
            resolveDNSHost: async (url) => {
                return new Promise((resolve, reject) => {
                  const hostname = new URL(url).hostname;
                  dns.lookup(hostname, (err, address, family) => {
                    if (err) {
                      reject(err);
                      return;
                    }

                    resolve(address); // if address resolves to localhost or '127.0.0.1' library will throw an error
                  });
                });
            }
        });

        // Check if there are any images in the preview data
        if (data.images && data.images.length > 0) {
          // Choose the image you want to display (e.g., the first one)
            const previewImageUrl = data.images[0];
            var response = { 
            imageUrl: previewImageUrl,
            url: data.siteName,
            description: data.title,
            link: data.url
            };
            console.log(JSON.stringify(response));
            res.json(response); //respond with json object
          // Or send the image directly (see below)

        } else {
            res.json({ message: "No image found for this URL."});
        }

      } catch (error) {
        console.error('Error fetching link preview:', error);
        res.status(500).json({ error: 'Error fetching link preview.' }); // Respond with JSON error
      }
    });
    app.post('/watch', async (req, res) => {
        console.log('test');
        var passage = await Passage.findOne({_id: req.body.passage.toString()});
        // console.log('what'+passage);
        if(!passage.watching.includes(req.session.user._id)){
            passage.watching.push(req.session.user._id);
        }
        else{
            passage.watching = passage.watching.filter(function(person){
                if(person._id == req.session.user._id){
                    return false;
                }
                return true;
            });
        }
        passage.markModified('watching');
        await passage.save();
        return res.send("Done");
    });
    app.post('/removeFile', async (req, res) => {
        var passage = await Passage.findOne({_id: req.body._id});
        passage.filename = '';
        passage.mimeType = '';
        await passage.save();
        res.send("Done.");
    });
    async function uploadProfilePhoto(req, res){
        var user = await User.findOne({_id: req.session.user._id});
        if(req.files == null){
            await fsp.unlink('./dist/uploads/'+user.thumbnail);
            user.thumbnail = '';
            await user.save();
        }else{
            // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
            var fileToUpload = req.files.photo;
            if(fileToUpload.size > 20 * 1024 * 1024){
                return "File too large.";
            }
            //uuid with  ext
            var uploadTitle = fileToUpload.name.split('.')[0] + v4() + "." + fileToUpload.name.split('.').at(-1);
            var where = 'uploads';
            console.log(uploadTitle);
            const partialpath = where === 'protected' ? where : 'dist/' + where;
            // Use the mv() method to place the file somewhere on your server
            fileToUpload.mv('./dist/'+where+'/'+uploadTitle, async function(err) {
                if (err){
                    return res.status(500).send(err);
                }
                await new Promise((resolveCompress) => {
                    exec('python3 compress.py "' + partialpath + '/' + uploadTitle + '" true',
                        async (err, stdout, stderr) => {
                            console.log(err + stdout + stderr);
                            console.log("Profile Image compressed.");
                            var oldThumbnail = user.thumbnail;
                            user.thumbnail = uploadTitle;
                            await user.save();
                            console.log("Old thumbnail:"+oldThumbnail);
                            console.log("Upload Title:"+uploadTitle);
                            try{
                                if(oldThumbnail != uploadTitle && oldThumbnail.length > 1)
                                    await fsp.unlink('./dist/uploads/'+oldThumbnail);
                            }catch(err){
                                console.log(err);
                            }
                            console.log("Deleted old profile photo.");
                            //not enough memory on server
                            //local for now
                            // if(process.env.LOCAL == 'true'){
                            //     exec('node nsfw.js '+where+'/'+uploadTitle + ' ' + where + ' ' + passage._id + ' image'
                            //     , (err, stdout, stderr) => {
                            //             //done
                            //             console.log(err + stdout + stderr);
                            //         });
                            // }
                            resolveCompress();
                        }
                    );
                });
            });
            user.thumbnail = uploadTitle;
            await user.save();
        }
    }
    async function deleteOldUploads(passage){
        var where = passage.personal ? 'protected' : 'uploads';
        var index = 0;
        for(const f of passage.filename){
            console.log(f);
            var passages = await Passage.find({
                filename: {
                    $in: [f]
                }
            });
            if(passages.length == 1){
                if(where == 'uploads'){
                    var path = './dist/'+where+'/'+f;
                }
                else{
                    var path = './protected/'+f;
                }
                console.log("FILEPATH TO UNLINK:" + passage.filename);
                try{
                    if(passage.filename.length > 0){
                        // await fsp.unlink(path); //deprecated
                        var splitPath = path.split('.');
                        var firstPart = splitPath.slice(0, -1).join('.');
                        var ext = splitPath.at(-1);
                        var orig = firstPart + '_orig.' + ext;
                        var medium = firstPart + '_medium.' + ext;
                        //unlink _orig
                        await fsp.unlink(orig);
                        console.log("Removed original version of upload.");
                        //unlink _medium
                        if(passage.medium[index] == true){
                            console.log("MEDIUM INDEX EXISTED");
                            await fsp.unlink(medium);
                            console.log("Removed medium version of upload.");
                        }
                        else{
                            console.log("MEDIUM INDEX NOT EXISTS: " + (passage.medium[index] == 'true') + (passage.medium[index] == true));
                        }
                        console.info(`removed old upload`);
                        var filteredArray = passage.filename.filter(e => e !== f)
                        passage.filename = filteredArray;
                        passage.mimeType.splice(index, 1);
                        passage.medium.splice(index, 1);
                        passage.compressed.splice(index, 1);
                        passage.markModified('medium');
                        passage.markModified('compressed');
                    }
                }
                catch(e){
                    console.log(passage.filename);
                    console.log(passage.filename.length);
                    console.log("No file to unlink.");
                    passage.filename = [];
                }
            }
            ++index;
        }
        await passage.save();
    }
    async function uploadFile(req, res, passage) {
        console.log("Upload Test");
        await deleteOldUploads(passage);
        var passages = await Passage.find({}).limit(20);
        var files = req.files;
        var fileToUpload = req.files.file;
        passage.filename = [];
        
        if (!Array.isArray(fileToUpload)) {
            fileToUpload = [fileToUpload];
        }

        //Check file sizes
        for(const file of fileToUpload){
            const mimeType = file.mimetype;
            // Check if the file is an image and its size exceeds 20MB (20 * 1024 * 1024 bytes)
            if (mimeType.startsWith('image/') && file.size > 20 * 1024 * 1024) {
                console.log(`Image "${file.name}" exceeds the 20MB limit.`);
                // You should handle this error appropriately, e.g., send an error response to the client
                return res.send(`Image "${file.name}" is too large (max 20MB).`);
            }
            // Check if the file is an image and its size exceeds 250MB (250 * 1024 * 1024 bytes)
            if (mimeType.startsWith('video/') && file.size > 250 * 1024 * 1024) {
                console.log(`Video "${file.name}" exceeds the 250MB limit.`);
                // You should handle this error appropriately, e.g., send an error response to the client
                return res.send(`Video "${file.name}" is too large (max 250MB).`);
            }
            else{
                // File has 250MB (250 * 1024 * 1024 bytes) limit
                if (file.size > 250 * 1024 * 1024) {
                    console.log(`File "${file.name}" exceeds the 250MB limit.`);
                    // You should handle this error appropriately, e.g., send an error response to the client
                    return res.send(`File "${file.name}" is too large (max 250MB).`);
                }
            }
        }

        // Process files sequentially using for...of loop
        let index = 0;
        for (const file of fileToUpload) {
            const mimeType = file.mimetype;
            const uploadTitle = file.name.split('.')[0] + '_' + v4() + "." + file.name.split('.').at(-1);
            const thumbnailTitle = v4() + ".jpg";
            const where = passage.personal ? 'protected' : 'uploads';
            
            const fullpath = where === 'protected' ? './' + where : './dist/' + where;
            const partialpath = where === 'protected' ? where : 'dist/' + where;
            const simplepath = where;

            passage.filename[index] = uploadTitle;
            
            // Wrap mv() in a Promise
            await new Promise((resolve, reject) => {
                file.mv(fullpath + '/' + uploadTitle, async (err) => {
                    if (err) {
                        console.log("DID NOT MOVE FILE");
                        reject(err);
                        return;
                    }
                    
                    console.log("MOVED FILE");
                    
                    try {
                        if (mimeType.split('/')[0] === 'image') {
                            await new Promise((resolveCompress) => {
                                exec('python3 compress.py "' + partialpath + '/' + uploadTitle + '" ' + 
                                     mimeType.split('/')[1] + ' ' + passage._id,
                                    async (err, stdout, stderr) => {
                                        await handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index);
                                        //not enough memory on server
                                        //local for now
                                        // if(process.env.LOCAL == 'true'){
                                        //     exec('node nsfw.js '+where+'/'+uploadTitle + ' ' + where + ' ' + passage._id + ' image'
                                        //     , (err, stdout, stderr) => {
                                        //             //done
                                        //             console.log(err + stdout + stderr);
                                        //         });
                                        // }
                                        resolveCompress();
                                    }
                                );
                            });
                        }

                        const newfilename = uploadTitle.split('.')[0] + '_c.' + uploadTitle.split('.')[1];
                        
                        if (mimeType.split('/')[0] === 'video') {
                            console.log("Beginning video processing for index:", index);
                            const ext = newfilename.split('.').at(-1);
                            let cmd = '';
                            
                            switch(ext) {
                                case 'webm':
                                    cmd = `ffmpeg -i ${partialpath}/${uploadTitle} -c:v libvpx -crf 18 -preset veryslow -c:a copy ${partialpath}/${newfilename}`;
                                    break;
                                default:
                                    cmd = `ffmpeg -i ${partialpath}/${uploadTitle} ${partialpath}/${newfilename}`;
                                    break;
                            }

                            console.log("Executing command:", cmd);
                            
                            try {
                                await new Promise((resolveVideo, rejectVideo) => {
                                    const currentIndex = index; // Capture current index
                                    const process = exec(cmd, async (err, stdout, stderr) => {
                                        if (err) {
                                            console.error("Error in video processing:", err);
                                            rejectVideo(err);
                                            return;
                                        }
                                        
                                        console.log('Video compressed. Index:', currentIndex, 'File:', newfilename);
                                        console.log('STDOUT:', stdout);
                                        console.log('STDERR:', stderr);
                                        
                                        try {
                                            passage.filename[currentIndex] = newfilename;
                                            passage.markModified('filename');
                                            await passage.save();

                                            if (newfilename !== uploadTitle) {
                                                await new Promise((resolveUnlink) => {
                                                    fs.unlink(partialpath + '/' + uploadTitle, (err) => {
                                                        if (err && err.code === 'ENOENT') {
                                                            console.info("File doesn't exist, won't remove it.");
                                                        } else if (err) {
                                                            console.error("Error occurred while trying to remove file:", err);
                                                        } else {
                                                            console.info(`Removed original video file for index ${currentIndex}`);
                                                        }
                                                        resolveUnlink();
                                                    });
                                                });
                                            }
                                              //not enough memory on server. local for now.
                                              //   if(process.env.LOCAL == 'true'){
                                              //       var screenshotName = v4();
                                              //       ffmpeg(fullpath+'/'+newfilename)
                                              //         .on('filenames', function(filenames) {
                                              //           console.log('Will generate ' + filenames.join(', '))
                                              //         })
                                              //         .on('end', async function() {
                                              //           console.log('Screenshots taken');
                                              //           exec('node nsfw.js '+where+'/'+newfilename + ' ' + where + ' ' + passage._id + ' video ' + screenshotName
                                              //               , (err, stdout, stderr) => {
                                              //               console.log(err + stdout + stderr);
                                              //               console.log("Finished Processing Media.");
                                              //               //done
                                              //               //delete each screenshot
                                              //               for(var t = 1; t < 4; ++t){
                                              //                 fs.unlink(partialpath + '/' + screenshotName+'_'+t + '.png', function(err2){
                                              //                   if (err2 && err2.code == 'ENOENT') {
                                              //                       // file doens't exist
                                              //                       console.info("File doesn't exist, won't remove it.");
                                              //                   } else if (err2) {
                                              //                       // other errors, e.g. maybe we don't have enough permission
                                              //                       console.error("Error occurred while trying to remove file");
                                              //                   } else {
                                              //                       console.info(`removed screenshot.`);
                                              //                   }
                                              //                 });
                                              //               }
                                              //           });
                                              //         })
                                              //         .screenshots({
                                              //           // Will take screens at 25%, 50%, 75%
                                              //           count: 3,
                                              //           filename: screenshotName +'_%i.png',
                                              //           folder: partialpath
                                              //         });
                                              // }
                                            resolveVideo();
                                        } catch (error) {
                                            console.error("Error in post-processing:", error);
                                            rejectVideo(error);
                                        }
                                    });

                                    // Add error handler for the exec process itself
                                    process.on('error', (error) => {
                                        console.error("Exec process error:", error);
                                        rejectVideo(error);
                                    });
                                });
                            } catch (error) {
                                console.error("Video processing failed:", error);
                                throw error; // Propagate error to main try-catch block
                            }
                        }

                        if (mimeType.split('/')[0] === 'image' && mimeType.split('+')[0].split('/')[1] === 'svg') {
                            passage.isSVG = true;
                        } else {
                            passage.isSVG = false;
                        }

                        passage.mimeType[index] = mimeType.split('/')[0];
                        
                        if (passage.mimeType[index] === 'model' || passage.isSVG) {
                            const data = req.body.thumbnail.replace(/^data:image\/\w+;base64,/, "");
                            const buf = Buffer.from(data, 'base64');
                            const fsp = require('fs').promises;
                            await fsp.writeFile(fullpath + '/' + thumbnailTitle, buf);
                            passage.thumbnail = thumbnailTitle;
                        } else {
                            passage.thumbnail = null;
                        }

                        passage.markModified('filename');
                        passage.markModified('mimeType');
                        await passage.save();
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            index++;
        }
        
        await passage.save();
        console.log(passage.filename + "TEST");
    }
    //One time code to compress all images on the site
    (async function(){
        //await updateImagesToUseSizeFlags();
    })();
    async function handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index){
        console.log(err);
        console.log(stdout);
        console.log(stderr);
        console.log("=Ok actually finished compressing img");
        passage.medium = passage.medium || [];
        passage.compressed = passage.compressed || [];
        var filepath = partialpath + '/' + uploadTitle;
        //change filename extension and mimetype if neccesary (converted png to jpg)
        if(stdout.includes("pngconvert " + __dirname + '/' +  filepath)){
            var pf = passage.filename[index].split('.'); //test.png
            passage.filename[index] = pf.slice(0, -1).join('.') + '.jpg'; //test.jpg
            console.log(passage.filename[index]);
        }
        //update database with medium if applicable
        if(stdout.includes("medium " + __dirname + '/' + filepath)){
            console.log("PASSAGE.MEDIUM=TRUE");
            passage.medium[index] = 'true';
        }else{
            passage.medium[index] = 'false';
        }
        console.log("NODEJS FILEPATH: " + "medium " + __dirname + '/' + filepath);
        console.log(stdout.includes("medium " + __dirname + '/' + filepath));
        console.log(stdout.includes("medium"));
        //if error set compressed to false and use original filepath (no appendage)
        if(stdout.includes("error " + filepath)){
            passage.compressed[index] = 'false';
        }else{
            passage.compressed[index] = 'true';
            try{
                await fsp.unlink(__dirname + '/' + filepath);
            }
            catch(e){
                console.log("No file to unlink.");
            }
        }
        passage.markModified('compressed');
        passage.markModified('medium');
        await passage.save();
    }
    //only for .png, .jpg, and .jpeg
    async function updateImagesToUseSizeFlags(){
        var passages = await Passage.find({});
        for(const passage of passages){
            console.log("passage");
            const where = passage.personal ? 'protected' : 'uploads';
            const fullpath = where === 'protected' ? './' + where : './dist/' + where;
            const partialpath = where === 'protected' ? where : 'dist/' + where;
            const simplepath = where;
            let index = 0;
            for(const f of passage.filename){
                //dont update unless it's these
                if(!['jpg', 'jpeg', 'png', 'webp'].includes(f.split('.').at(-1))){
                    continue;
                }
                const uploadTitle = f;
                await new Promise((resolveCompress) => {
                    exec('python3 compress.py "' + partialpath + '/' + uploadTitle + '"',
                        async (err, stdout, stderr) => {
                            await handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index);
                            resolveCompress();
                        }
                    );
                });
                ++index;
            }
        }
        console.log("All done updating images.");
    }
    //okay so we have two issues
    //1.The out of memory error means we have to create _medium files for each _orig without a medium if the size is over 500px width
    //2.we need to update medium=true for all passages with a _medium file; and give defaults for other new fields
    //3.Create a function that updates all fields with a default value
    //create a _medium file for every _orig file
    async function createMediumFilesForOrig(){
        var where = 'uploads';
        const fullpath = where === 'protected' ? './' + where : './dist/' + where;
        const partialpath = where === 'protected' ? where : 'dist/' + where;
        const simplepath = where;
        var files = await fsp.readdir('./dist/uploads');
        console.log(files);
        for(const file of files){
            var tag = file.split('_').at(-1);
            if(tag == 'orig'){
                var mediums = [];
                var index = 0;
                for(const f of files){
                    var t = f.split('_').at(-1);
                    if(t == 'medium'){
                        mediums.push('medium');
                    }
                    //if on last iteration
                    if(index === files.length - 1){
                        if(mediums.length === 0){
                            //there is no medium file for this _orig
                            //run it through compress.py
                            //get passage for file and update its params
                            await new Promise((resolveCompress) => {
                                exec('python3 compress.py "' + partialpath + '/' + file + '"',
                                    async (err, stdout, stderr) => {
                                        await handleCompression(err, stdout, stderr, passage, partialpath, uploadTitle, index);
                                        resolveCompress();
                                    }
                                );
                            });
                        }
                    }
                    ++index;
                }
            }
        }
    };
    //One time code
    (async function(){
        // await createMediumFilesForOrig();
    })();
    app.get('/verify/:user_id/:token', function (req, res) {
        var user_id = req.params.user_id;
        var token = req.params.token;

        User.findOne({'_id': user_id.trim()}, function (err, user) {
            if (user.token == token) {
                console.log('that token is correct! Verify the user');

                User.findOneAndUpdate({'_id': user_id.trim()}, {'verified': true}, function (err, resp) {
                    console.log('The user has been verified!');
                });

                res.redirect('/');
            } else {
                console.log('The token is wrong! Reject the user. token should be: ' + user.verify_token);
                res.redirect('/');
            }
        });
    });

    var extList = {
        'python' : '.py',
        'javascript' : '.js',
        'css' : '.css',
        'mixed' : '.html',
        'bash': '.sh',
        'ejs': '.ejs',
        'markdown': '.md',
        'rich': '.default',
        'text': '.txt'
    };
    //GET more extensive list
    function getExt(lang){
        return extList[lang].toString();
    }
    function getLang(ext){
        return Object.keys(extList).find(key => extList[key] === ext);
    }

    //For Sasame Rex - CES Connect
    class Directory {
        constructor(passage){
            this.title = encodeURIComponent(passage.title);
            //index.html (rtf from quill)
            this.code = passage.code || '';
            this.contents = [];
            this.ext = getExt(passage.lang);
        }
    }
    class File {
        constructor(passage){
            this.title = encodeURIComponent(passage.title);
            this.code = passage.code || '';
            this.ext = getExt(passage.lang);
        }
    }

    function getDirectoryStructure(passage){
        var directory = new Directory(passage);
        // populate directory recursively
        (function lambda(passages, directory){
            for(const p of passages){
                if(p.passages.length > 0){
                    let dir = new Directory(p);
                    directory.contents.push(dir);
                    lambda(p, dir);
                }
                else{
                    let file = new File(p);
                    directory.contents.push(file);
                }
            }
        })(passage.passages, directory);
        return directory;
    }

    async function decodeDirectoryStructure(directory, location="./dist/filesystem"){
        const fsp = require('fs').promises;
        //clear filesystem
        await fsp.rmdir('./dist/filesystem', {recursive: true, force: true});
        //regenerate
        await fsp.mkdir("./dist/filesystem");
        //add new directory
        await fsp.mkdir(location + '/' + directory.title);
        await fsp.writeFile(location + '/' + directory.title + '/index' + directory.ext, directory.code);
        for(const item of directory.contents){
            if(item instanceof Directory){
                await decodeDirectoryStructure(location + '/' + directory.title, item);
            }
            else if(item instanceof File){
                var ext = item.ext;
                if(ext == 'mixed'){
                    item.code = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta http-equiv="X-UA-Compatible" content="IE=edge">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>`+item.title+`</title>
                        <style>`+item.css+`</style>
                        <script src="/jquery.min.js"></script>
                    </head>
                    <body>
                        <%-`+item.html+`%>
                        <script>`+item.javascript+`</script>
                    </body>
                    </html>
                    `;
                    ext = 'html';
                }
                await fsp.writeFile(location + '/' + directory.title + '/' + item.title + '.' + ext, item.code);
            }
        }
    }

    async function loadFileSystem(){
        var location = '/filesystem';
        //get all root passages
        var passages = await Passage.find({parent: null});
        //get all root directories
        var directories = [];
        for(const passage of passages){
            directories.push(getDirectoryStructure(passage));
        }
        //implement in filesystem
        for(const directory of directories){
            await decodeDirectoryStructure(location, directory);
        }
    }

    async function passageFromDirectory(filePath){

    }

    app.post('/install_passage', async function(req, res){
        const fsp = require('fs').promises;
        var passage = await Passage.findOne({_id: req.body._id});
        var directory = getDirectoryStructure(passage);
        await decodeDirectoryStructure(directory);
        res.send("Done")
    });

    app.post('/test/', async function(req, res){
        res.send("OK");
    });

    /*
        ROUTERS FOR FILESTREAM
    */

    if(process.env.DOMAIN == 'localhost'){
        app.post('/server_eval', requiresAdmin, function(req, res) {
            eval(req.code);
        });
    }
    //testing
    // (async function(){
      //   //TEMP: Change all mixed passages to rich
     //    await Passage.updateMany({
       //      javascript: {
        //         $ne: null
         //    },
          //   html: {
           //      $ne: null
            // },
    //     }, {
     //        lang: 'mixed'
      //   });
    //     await Passage.updateMany({
    //         lang: 'mixed',
     //    }, {
      //       lang: 'rich'
       //  });
    // })();
    // (async function(){
     //    //clear filestream
    //     await Passage.deleteMany({mainFile: true});
     //    //create filestream
      //   await loadFileStream();
    // })();
    //\testing
    async function syncFileStream(){
        //clear filestream
        //await Passage.updateMany({mainFile:true}, {mainFile:false});
        //don't uncomment, dangerous
        //await Passage.deleteMany({fileStreamPath: {$ne:null}});
        var author = await User.findOne({admin:true});
        var top = await Passage.findOne({
            title: 'Infinity Forum Source Code',
            author: author._id,
            fileStreamPath: __dirname + '/',
            mainFile: true,
            public: false,
            parent: null
        });
        console.log(top);
        if(top == null){
            console.log("HERE");
            top = await Passage.create({
                title: 'Infinity Forum Source Code',
                author: author._id,
                fileStreamPath: __dirname + '/',
                mainFile: true,
                public: false,
                parent: null,
                date: new Date("2023-05-04 01:00:00")
            });
        }
        console.log("TOP:"+top);
        //create filestream if not exists otherwise sync it
        await loadFileStream(top);
    }
    //create FileStream passage if not exists
    async function loadFileStream(top, directory=__dirname){
        const fsp = require('fs').promises;
        var author = await User.findOne({admin:true});
        try {
            const files = await readdir(directory);
            // console.log(directory);
            let parentDirectory = await Passage.findOne({
                mainFile: true,
                fileStreamPath: directory
            });
            for (const file of files){
                //need to change this to be for specific full paths
                if(file == '.env' || file == '.git' || file == 'node_modules' || file == 'images' || file == 'uploads' || file == 'protected' || file == 'nsfw' || file == 'libssl1.1_1.1.1f-1ubuntu2_amd64.deb' || file == '.DS_Store' || file == 'dump' || file == 'backup' || file.includes('.git-rewrite') || file == 'package-lock.json' || file == 'nodemon.log' || file == 'extra'){
                    continue;
                }
                console.log(file);
                // console.log(directory + '/' + file);
                //create passage for file or directory
                var stats = await fsp.stat(directory + '/' + file);
                var title = file;
                if(await stats.isDirectory()){
                    //create directory passage
                    var exists = await Passage.findOne({
                        mainFile: true,
                        fileStreamPath: directory + '/' + file,
                        title: title + '/',
                    });
                    if(exists == null){
                        let passage = await Passage.create({
                            title: title + '/',
                            author: author._id,
                            fileStreamPath: directory + '/' + file,
                            mainFile: true,
                            public: false,
                            parent: directory == __dirname ? top._id : parentDirectory._id,
                            date: new Date("2023-05-04 01:00:00")
                        });
                    }else{
                        exists.parent = directory == __dirname ? top._id : parentDirectory._id;
                        await exists.save();
                    }
                    //recursively create passages
                    //put in parent directory
                    await loadFileStream(top, directory + '/' + file);
                }
                else{
                    var lang = getLang('.' + file.split('.').at('-1'));
                    if(typeof lang === 'undefined'){
                        lang = 'text';
                    }
                    //create passage
                    var exists = await Passage.findOne({
                        mainFile: true,
                        fileStreamPath: directory + '/' + file,
                        title: file
                    });
                    if(exists != null){
                        try {
                            const fullPath = directory + '/' + file;
                            exists.code = await fsp.readFile(fullPath, 'utf-8');
                            if(file == '.gitignore'){
                                console.log("CODE:"+exists.code);
                            }
                            // console.log('Result:', exists.code);
                            await exists.save();
                        } catch (error) {
                          console.error('Error reading file:', error);
                        }
                    }
                    if(exists == null){
                        let passage = await Passage.create({
                            title: title,
                            author: author._id,
                            code: await fsp.readFile(directory + '/' + file),
                            lang: lang,
                            fileStreamPath: directory + '/' + file,
                            mainFile: true,
                            parent: directory == __dirname ? top._id : parentDirectory._id,
                            public: false,
                            date: new Date("2023-05-04 01:00:00")
                        });
                        if(parentDirectory != null && !parentDirectory.passages.includes(passage)){
                            parentDirectory.passages.push(passage);
                            parentDirectory.markModified('passages');
                            await parentDirectory.save();
                        }
                    }
                    else{
                        // console.log(exists);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        // console.error(await err);
        }
    }

    app.post('/makeMainFile', requiresAdmin, async function(req, res){
        var passage = await Passage.findOne({_id: req.body.passageID});
        var passage = await getPassage(passage);
        //check if file/dir already exists
        var exists = await Passage.findOne({fileStreamPath: req.body.fileStreamPath});
        if(exists != null){
            exists.mainFile = false;
            await exists.save();
        }
        passage.mainFile = true;
        await passage.save();
        //restart server to apply changes
        updateFile(req.body.fileStreamPath, passage.all);
    });
    app.get('/testing', async function(req, res){
        res.render('testing');
    });
    app.get('/filestream/:viewMainFile?/:directory?', async function(req, res){
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        //output passages in directory / or req.body.directory
        var directory = req.params.directory || __dirname;
        //get passages where fileStreamPath starts with directory
        var viewMainFile;
        if(req.params.viewMainFile === 'false'){
            viewMainFile = false;
        }
        else if(req.params.viewMainFile === 'true'){
            viewMainFile = true;
        }
        else{
            viewMainFile = true;
        }
        var passages;
        if(viewMainFile){
            passages = await Passage.find({
                fileStreamPath: {
                    $regex: '^' + directory + '/[^/]*(/?)$',
                    $options: 'i'
                },
                mainFile: viewMainFile
            }).collation({locale: 'en', strength: 2}).sort({title: 1}); //sort alphabetically
        }
        else{
            //there may be duplicates so sort by stars
            passages = await Passage.find({
                fileStreamPath: {
                    $regex: '^' + directory + '/[^/]*(/[^/]*)?$',
                    $options: 'i'
                },
                // mainFile: viewMainFile
            }).sort({stars: '-1'}).limit(10);
        }
        let bookmarks = [];
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
        // }
        if(req.session.user){
            bookmarks = getBookmarks(req.session.user);
        }
        for(var i = 0; i < passages.length; ++i){
            passages[i] = await getPassage(passages[i]);
        }
        res.render("filestream", {
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passages: passages, 
            mainFiles: viewMainFile,
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            bookmarks: bookmarks,
            ISMOBILE: ISMOBILE
        });
        // return res.render('passages', {
        //     passages: passages,
        //     subPassages: false
        // });
        //on directory click just run same route with different directory
        
    });
    app.post('/syncfilestream', requiresAdmin, async function(req, res){
        const fsp = require('fs').promises;
        await syncFileStream();
        // var code = await fsp.readFile("/home/uriah/Desktop/United Life/CES/ChristianEngineeringSolutions/.gitignore", 'utf-8')
        // console.log(code);
        // console.log(await fsp.readFile("/home/uriah/Desktop/United Life/CES/ChristianEngineeringSolutions/rs.sh"));
        res.send("Done.");
    });
    app.post('/updateFileStream', requiresAdmin, async function(req, res) {
        var passage = await Passage.findOne({_id: req.body.passageID});
        passage.fileStreamPath = req.body.fileStreamPath;
        await passage.save();
        //create file if not exists
        //else update
        //check if directory or file
        var isDirectory = false;
        var isFile = false;
        if(passage.fileStreamPath.at(-1) == '/'){
            isDirectory = true;
        }
        else{
            isFile = true;
        }
        const fsp = require('fs').promises;
        //TODO: check if need to check for exists or if fsp handles this
        if(isDirectory){
            await fsp.mkdir(__dirname + passage.fileStreamPath);
        }
        else if(isFile){
            await fsp.writeFile(__dirname + passage.fileStreamPath);
        }
    });
    app.post('/run_file', requiresAdmin, function(req, res) {
        var file = req.body.file;
        var ext = file.split('.')[file.split('.').length - 1];
        var bash = 'ls';
        switch(ext){
            case 'js':
            bash = 'node ' + file;
            break;
            case 'sh':
            bash = 'sh ' + file;
            break;
        }
        exec(bash, (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            res.send(JSON.stringify(err));
            return;
          }
          res.send(stdout);
          // the *entire* stdout and stderr (buffered)
          // console.log(`stdout: ${stdout}`);
          // console.log(`stderr: ${stderr}`);
        });
    });
    function updateFile(file, content){
        fs.writeFile(file, content, function(err){
            if (err) return console.log(err);
            //restart server to apply changes
            //happens after write on dev
            if(process.env.REMOTE){
                var shell = require('shelljs');
                //in sudo visudo
                //user ALL = NOPASSWD: /home/user/Infinity-Forum/restart.sh
                    var bash = 'bash ' + __dirname + 'restart.sh';
                shell.exec(bash, function(code, output) {
                console.log('Exit code:', code);
                console.log('Program output:', output);
                });

            }
        });
    }
    app.post('/update_file', requiresAdmin, function(req, res) {
        var file = req.body.file;
        var content = req.body.content;
        fs.writeFile(file, content, function(err){
          if (err) return console.log(err);
          res.send('Done');
        });
    });
    app.get('/terms', function(req, res) {
        res.render('terms');
    });
    app.get('/protected/:filename', async function(req, res) {
        if(!req.session.user){
            return res.redirect('/');
        }
        var passages = await Passage.find({
            filename: {
                $in: [req.params.filename]
            }
        });
        var clear = false;
        for(const p of passages){
            if(p.author._id.toString() == req.session.user._id.toString()
                || p.users.includes(req.session.user._id)){
                clear = true;
                break;
            }
        }
        if(clear){
            switch(req.params.filename.split('.').at(-1)){
                case 'png':
                    res.type('image/png');
                    break;
                case 'webm':
                    res.type('video/webm');
                    break;
            }
            return res.sendFile('protected/'+req.params.filename, {root: __dirname});
        }
        else{
            return res.redirect('/');
        }
    });
    //API Funcs for returning objects directly
    //TODO: Just check for api parameter in original routes
    //for daemons to get passages
    app.get('/findOne', async function(req, res) {
        return res.send(await Passage.findOne({_id: req.query._id}));
    });
    //FUNCTIONS
    //authenticate input against database
    function authenticateUser(email, password, callback) {
      User.findOne({ email: email })
        .exec(function (err, user) {
          if (err) {
            return callback(err)
          } else if (!user) {
            var err = new Error('User not found.');
            err.status = 401;
            return callback(err);
          }
          bcrypt.compare(password, user.password, function (err, result) {
            if (result === true) {
              return callback(err, user);
            } else {
              return callback(err);
            }
          })
        });
    }
    async function authenticateUsername(username, password){
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let obj = {};
        let search = '';
        if(username.match(regex) === null){
            //it's a username
            search = "username";
        }
        else{
            //it's an email
            search = "email";
        }
        obj[search] = username;
        var user = await User.findOne(obj);
        if(!user){
            return false;
        }
        var result = await bcrypt.compare(password, user.password);
        if(result === true){
            return user;
        }
        return false;
    }
    async function requiresLogin(req, res, next){
        if(req.session.user){
            next();
        }
        else{
            return res.redirect('/loginform');
        }
    }
    async function requiresAdmin(req, res, next){
        if(req.session.user && req.session.user.admin){
            next();
        }
        else{
            return res.send('Requires Admin.');
        }
    }
    async function sendEmail(to, subject, body){
        const EMAIL_PASSWORD = await accessSecret("EMAIL_PASSWORD");
        var transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USERNAME,
            pass: EMAIL_PASSWORD
          }
        });

        var mailOptions = {
          from: 'admin@infinity-forum.org',
          to: to,
          subject: subject,
          text: body
        };

        transporter.sendMail(mailOptions, function(error, info){
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
          return true;
        });
        return true;
    }

    //AI
    // (async function(){
    //     await PrimeEngine();
    // })();
    //run every minute
    // cron.schedule('* * * * *', async () => {
    //     await PrimeEngine();
    // });
    //clean engine every 10 minutes
    // cron.schedule('*/10 * * * *', async () => {
    //     await cleanEngine();
    //     console.log('Cleaned AI.');
    // });
    //return synthetically annealled random passage
    //in other words, bias towards a greater number of stars
    async function anneal(){
        var numDaemons = await Passage.countDocuments();
        //bias towards later records (more stars)
        var random1 = Math.floor(Math.random() * numDaemons * 3.3333333);
        //go back some
        var random2 = Math.floor(Math.random() * numDaemons);
        var slide = random1 - random2;
        if(slide >= numDaemons){
            slide = numDaemons - 1;
        }
        else if(slide < 0){
            slide = 0;
        }
        return slide;
    }
    //just treats all passages as daemons
    async function PrimeEngine(){
        var passage;
        //Get random passage from database
        var numDaemons = await Passage.countDocuments();
        // Get a random entry
        // var random = Math.floor(Math.random() * numDaemons);
        var slide = await anneal();
        var passage = await Passage.findOne().sort('stars').skip(slide).exec();
        //modify daemon with another daemon
        var modifiedPassage = await BetaEngine(passage);
        console.log('Synthetic Passage Created: ' + modifiedPassage.title);
    }

    //beta engine makes passage into daemon and feeds PrimeEngine
    //anneal by rank
    async function BetaEngine(original){
        var titleEnd = " - Sasame AI";
        var author = await User.findOne({admin:true});
        //get random passage as daemon
        var numDaemons = await Passage.countDocuments();
        // Get a random entry
        var slide = await anneal();
        // var random = Math.floor(Math.random() * numDaemons);
        var daemon = await Passage.findOne().sort('stars').skip(slide).exec();
        //personalize daemon to affect target passage
        var personalDaemon = await passageController.copyPassage(daemon, [author], null, async function(){
            
        }, true);
        personalDaemon.synthetic = true;
        personalDaemon.param = JSON.stringify(original);
        personalDaemon.title = personalDaemon.title.split(' - Sasame AI')[0] + titleEnd;
        var paramTitle = '';
        if(JSON.parse(personalDaemon.param) != null){
            paramTitle += JSON.parse(personalDaemon.param).title;
        }
        //might need to stringify personalDaemon.params
        //anyway; this makes it easy for a daemon to access its parameters
        //then, might I suggest NOHTML?
        personalDaemon.libs = 'const PARAMTITLE =   "'+paramTitle+'";\n';
        personalDaemon.libs +=  'const PARAM = '+personalDaemon.param+';\n'; //wont show in editor (long) but they can access the var
        personalDaemon.javascript = '//const PARAMTITLE = "'+paramTitle+'";\n// ex. var paramDetails = JSON.stringify(PARAM); // (PARAM is a passage)\n' + (personalDaemon.javascript || '');
        //ex. var button = params[0].title; //make button from param
        await personalDaemon.save();
        //in iframe will be a modification of the original passage
        return personalDaemon;
    }
    async function cleanEngine(){
        //delete all synthetic passage with 0 stars
        //and all sub passages
        await Passage.deleteMany({synthetic: true, stars: 0});
        console.log("Cleaned AI.");
    }
    //remove all passages with 0 stars, and no sub passages within a public parent or root
    async function filterPassages(){
        await Passage.deleteMany({
            stars: 0,
            parent: null,
            passages: null
        });
        var publics = await Passage.find({
            public: true
        });
        for(const passage of publics){
            if(passage.stars == 0){
                await Passage.deleteOne({
                    _id: passage._id
                });
            }
        }
    }
    async function optimizeEngine(){
        //delete bottom 20% of passages
        //...
        return;
    }
    // cleanEngine();

    //run on passage update if content chsnges
    async function propagatePassage(passageID){
        var passage = Passage.findOne({_id: passsageID}).populate('input');
        //if lang = rich then content
        //else code
        var output;
        if(passage.lang == 'rich'){
            output = passage.content;
        }
        else{
            output = passage.code;
        }
        var input = passage.input;
        var inputs = [];
        //get outputs of all inputs
        for(const i of input){
            inputs.push(i.final);
        }
        var j = 1;
        //input1-x are protected terms
        for(const o of inputs){
            output.replace('input' + j, o);
            ++j;
        }
        passage.final = output;
        await passage.save();
        //propagate passage for each passage using this passage as an input
        var passages = Passage.find({
            //find if in array
            input: {
                $in: [passage]
            }
        });
        for(const p of passages){
            await propagatePassage(p._id);
        }
    }


    //SOCKETS 
    // io.on('connection', async (socket) => {
    //     socket.join('root');
    //     console.log('A user connected');
    //     //set room from client by sending passageID
    //     socket.on('controlPassage', async (passageID) => {
    //         console.log('works');
    //         // console.log(socket.handshake.session);
    //         var passage = await Passage.findOne({_id: passageID});
    //         socket.leave('root');
    //         socket.join(passage._id.toString());
    //         await User.findOneAndUpdate({_id: socket.handshake.session.user._id.toString()}, {$set: {room: passage._id.toString()}});
    //         io.sockets.in(passage._id.toString()).emit(passage._id.toString(), "Room for Passage: " + passage.title);
    //     });
    //     //send messages to room from client
    //     socket.on('add', async (msg) => {
    //         var user = await User.findOne({_id: socket.handshake.session.user._id.toString()});
    //         var room = user.room;
    //         console.log(room);
    //         io.sockets.in(room).emit(room, user.name + ': ' + msg);

    //     });
    //     socket.on('disconnect', function () {
    //         console.log('A user disconnected');
    //     });
    // });
    const initialMemory = process.memoryUsage().heapUsed;
    const MAX_MEMORY_INCREASE = 500 * 1024 * 1024; // 500MB increase threshold

    // Check memory every 1 minutes
    // setInterval(() => {
    //     const currentMemory = process.memoryUsage().heapUsed;
    //     const memoryIncrease = currentMemory - initialMemory;

    //     if (memoryIncrease > MAX_MEMORY_INCREASE) {
    //         console.error(`Memory leak alert! Memory increased by ${memoryIncrease / 1024 / 1024}MB`);
    //         // Send alert (email, Slack, etc.)
    //         console.log('Memory Leak Warning', `Memory increased by ${memoryIncrease / 1024 / 1024}MB`);
    //     }
    // }, 1 * 60 * 1000);


    //FEED SYSTEM
    /**
     * Feed monitoring and performance tracking
     * This module helps track and optimize feed algorithm performance
     */

    // Performance tracking for feed generation
    const feedPerformanceStats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalGenerationTimeMs: 0,
      slowGenerations: 0
    };

    /**
     * Middleware to track feed performance metrics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    async function trackFeedPerformance(req, res, next) {
      // Only track performance for feed routes
      if (!req.originalUrl.startsWith('/feed')) {
        return next();
      }

      const startTime = Date.now();
      const userId = req.session.user?._id;
      
      if (!userId) {
        return next();
      }
      
      // Check if we'll have a cache hit
      const cacheKey = `user_feed:${userId}`;
      const hasCachedFeed = await redis.exists(cacheKey);
      
      // Store original end function
      const originalEnd = res.end;
      
      // Override end function to capture timing
      res.end = function(chunk, encoding) {
        // Restore original end function
        res.end = originalEnd;
        
        // Calculate performance metrics
        const duration = Date.now() - startTime;
        feedPerformanceStats.totalRequests++;
        
        if (hasCachedFeed) {
          feedPerformanceStats.cacheHits++;
        } else {
          feedPerformanceStats.cacheMisses++;
          feedPerformanceStats.totalGenerationTimeMs += duration;
          
          // Track slow generations (over 1 second)
          if (duration > 1000) {
            feedPerformanceStats.slowGenerations++;
            console.warn(`Slow feed generation for user ${userId}: ${duration}ms`);
          }
        }
        
        // Call the original end function
        return originalEnd.call(this, chunk, encoding);
      };
      
      // Continue with the request
      next();
    }

    /**
     * Get feed performance statistics
     * @return {Object} Performance statistics
     */
    function getFeedPerformanceStats() {
      const cacheHitRate = feedPerformanceStats.totalRequests > 0 
        ? (feedPerformanceStats.cacheHits / feedPerformanceStats.totalRequests * 100).toFixed(2) 
        : 0;
      
      const avgGenerationTime = feedPerformanceStats.cacheMisses > 0 
        ? (feedPerformanceStats.totalGenerationTimeMs / feedPerformanceStats.cacheMisses).toFixed(2) 
        : 0;
      
      return {
        totalRequests: feedPerformanceStats.totalRequests,
        cacheHitRate: `${cacheHitRate}%`,
        avgGenerationTime: `${avgGenerationTime}ms`,
        slowGenerations: feedPerformanceStats.slowGenerations
      };
    }

    /**
     * Admin endpoint to check feed generation stats
     * Add this to your routes
     */
    function setupFeedMonitoringEndpoint(app, authMiddleware) {
      app.get('/api/admin/feed-stats', authMiddleware, async (req, res) => {
        try {
          // Get basic performance stats
          const stats = getFeedPerformanceStats();
          
          // Add queue information
          stats.activeFeedJobs = await feedQueue.getActiveCount();
          stats.waitingFeedJobs = await feedQueue.getWaitingCount();
          stats.completedFeedJobs = await feedQueue.getCompletedCount();
          stats.failedFeedJobs = await feedQueue.getFailedCount();
          
          res.json(stats);
        } catch (error) {
          console.error('Error getting feed stats:', error);
          res.status(500).json({ error: 'Error retrieving feed statistics' });
        }
      });
    }

    /**
     * Track user engagement with feed content
     * This helps improve the feed algorithm over time
     * @param {string} userId - User ID
     * @param {string} passageId - Passage ID
     * @param {string} action - Type of interaction (view, star, comment, etc.)
     */
    async function trackFeedEngagement(userId, passageId, action) {
      try {
        // Log engagement for analytics
        console.log(`Feed engagement: ${userId} ${action} ${passageId}`);
        
        // You can store this in a database for analytics
        // This data is valuable for improving the feed algorithm
        
        // Example: Store in Redis as a sorted set for recency
        const now = Date.now();
        await redis.zadd(`feed_engagement:${userId}`, now, `${action}:${passageId}`);
        
        // Use this data to improve the feed algorithm for this user
        // For example, if they consistently engage with certain authors or topics
        
        return true;
      } catch (error) {
        console.error('Error tracking feed engagement:', error);
        return false;
      }
    }

    /**
     * Get user engagement data for analytics
     * @param {string} userId - User ID
     * @param {number} limit - Number of records to retrieve
     * @return {Array} Engagement data
     */
    async function getUserEngagementData(userId, limit = 100) {
      try {
        // Get recent engagement data from Redis
        const data = await redis.zrevrange(`feed_engagement:${userId}`, 0, limit - 1, 'WITHSCORES');
        
        // Parse and format the data
        const engagementData = [];
        for (let i = 0; i < data.length; i += 2) {
          const [action, passageId] = data[i].split(':');
          const timestamp = parseInt(data[i+1]);
          
          engagementData.push({
            userId,
            passageId,
            action,
            timestamp: new Date(timestamp),
          });
        }
        
        return engagementData;
      } catch (error) {
        console.error('Error getting user engagement data:', error);
        return [];
      }
    }

    // Expose an engagement tracking endpoint
    // This can be called via AJAX when users interact with content
    function setupEngagementEndpoint(app) {
      app.post('/api/track-engagement', async (req, res) => {
        if (!req.session.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { passageId, action } = req.body;
        
        if (!passageId || !action) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        await trackFeedEngagement(req.session.user._id, passageId, action);
        
        return res.json({ success: true });
      });
    }

    /**
     * Generate engagement analytics for admin dashboard
     */
    async function generateEngagementAnalytics() {
      try {
        // Get engagement data for the last 30 days
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        
        // You would implement this with a database query
        // This is just a simplified example
        
        return {
          totalViews: 0,
          totalStars: 0,
          totalComments: 0,
          activeUsers: 0,
          topPassages: [],
          mostEngagedUsers: []
        };
      } catch (error) {
        console.error('Error generating engagement analytics:', error);
        return null;
      }
    }
    // Add this after a passage is saved to update followers' feeds in real-time
    PassageSchema.post('save', async function(doc) {
      // Only trigger for brand new passages that aren't versions of other passages
      if (!doc.versionOf) {
        try {
          await afterPassageCreation(doc);
        } catch (error) {
          console.error('Error updating feeds after passage creation:', error);
        }
      }
    });
    // Add a route to manually invalidate a user's feed cache
    // Useful during development or for admin tools
    app.post('/api/admin/invalidate-feed-cache', requiresAdmin, async (req, res) => {
      try {
        const { userId } = req.body;
        
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        
        const cacheKey = `user_feed:${userId}`;
        await redis.del(cacheKey);
        
        // Queue a job to regenerate the feed
        await feedQueue.add(
          { userId },
          { priority: 1 } // High priority
        );
        
        res.json({ success: true, message: 'Feed cache invalidated and regeneration queued' });
      } catch (error) {
        console.error('Error invalidating feed cache:', error);
        res.status(500).json({ error: 'Failed to invalidate feed cache' });
      }
    });

    // Add a route to clear all feed caches
    // Use with caution - this will cause a spike in database load
    app.post('/api/admin/clear-all-feed-caches', requiresAdmin, async (req, res) => {
      try {
        // Get all feed cache keys
        const keys = await redis.keys('user_feed:*');
        
        if (keys.length > 0) {
          // Delete all feed caches
          await redis.del(keys);
          console.log(`Cleared ${keys.length} feed caches`);
        }
        
        res.json({ success: true, cleared: keys.length });
      } catch (error) {
        console.error('Error clearing feed caches:', error);
        res.status(500).json({ error: 'Failed to clear feed caches' });
      }
    });

    app.get('/feed', async (req, res) => {
      if (!req.session.user) {
        return res.redirect('/loginform');
      }

      const ISMOBILE = browser(req.headers['user-agent']).mobile;
      const page = parseInt(req.query.page || '1');
      const limit = DOCS_PER_PAGE;
      
      try {
        // Get feed with pagination
        const result = await generateFeedWithPagination(req.session.user, page, limit);
        
        // If we need to redirect to a different page (e.g., if requested page is beyond results)
        if (result.redirect) {
          return res.redirect(`/feed?page=${result.page}`);
        }
        
        // Process passages with getPassage to get all required data
        const passages = [];
        for (let i = 0; i < result.feed.length; i++) {
          const processedPassage = await getPassage(result.feed[i]);
          passages.push(processedPassage);
        }
        
        // Get bookmarks for sidebar
        let bookmarks = [];
        if (req.session.user) {
          bookmarks = await getBookmarks(req.session.user);
        }
        
        // Render the stream view with feed data
        return res.render("stream", {
          subPassages: false,
          passageTitle: false, 
          scripts: scripts, 
          passages: passages, 
          passage: {
            id: 'root', 
            author: {
              _id: 'root',
              username: 'Sasame'
            }
          },
          bookmarks: bookmarks,
          ISMOBILE: ISMOBILE,
          page: 'feed',
          whichPage: 'feed',
          thread: false,
          currentPage: result.currentPage,
          totalPages: result.totalPages
        });
      } catch (error) {
        console.error('Error generating feed:', error);
        return res.status(500).send('Error generating feed. Please try again later.');
      }
    });
    app.get('/bank', async (req, res) => {
      if (!req.session.user) {
        return res.redirect('/loginform');
      }
      var user = await User.findOne({_id:req.session.user._id});
      return res.render('bank', {borrowedAmount:user.borrowedStars, starsBorrowedThisMonth: user.starsBorrowedThisMonth});
      
    });
    app.post('/borrow-stars', async (req, res) => {
      if (!req.session.user) {
        return res.redirect('/loginform');
      }
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
        var user = await User.findOne({_id:req.session.user._id});
        //check number of stars borrowed this month
        if(user.monthStarsBorrowed == null){
            user.monthStarsBorrowed = Date.now();
        }
        var today = new Date();
        //its been more than a month since they last got stars so reset the month we're looking at
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

    });
    function monthsBetween(date1, date2) {
      const yearDiff = date2.getFullYear() - date1.getFullYear();
      const monthDiff = date2.getMonth() - date1.getMonth();
      return (yearDiff * 12) + monthDiff;
    }
    // Import the Twilio library
    const twilio = require('twilio');

    // Your Account SID and Auth Token from twilio.com/console
    const accountSid = await accessSecret("TWILIO_ACCOUNT_SID");
    const authToken = await accessSecret("TWILIO_AUTH_TOKEN");
    const client = twilio(accountSid, authToken);

    // Your Twilio Verify Service SID (found in the Twilio Console -> Verify -> Services)
    const serviceSid = await accessSecret("TWILIO_SERVICE_SID");

    // Function to start the verification process
    async function startVerification(phoneNumber, channel = 'sms') {
      try {
        const verification = await client.verify.v2.services(serviceSid)
          .verifications
          .create({
            to: phoneNumber,
            channel: channel, // 'sms' or 'call'
          });
        console.log('Verification initiated:', verification.sid);
        return { success: true, verificationSid: verification.sid };
      } catch (error) {
        console.error('Error initiating verification:', error);
        return { success: false, error: error.message };
      }
    }

    // Function to check the verification code
    async function checkVerification(phoneNumber, code, verificationSid) {
      try {
        const verificationCheck = await client.verify.v2.services(serviceSid)
          .verificationChecks
          .create({
            to: phoneNumber,
            code: code,
            verificationSid: verificationSid // Optional, but recommended for security
          });
        console.log('Verification check status:', verificationCheck.status);
        return { success: verificationCheck.status === 'approved', status: verificationCheck.status };
      } catch (error) {
        console.error('Error checking verification:', error);
        return { success: false, error: error.message };
      }
    }

    // Rate limiter for requestVerificationCode endpoint
    const requestVerificationLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour window
      max: 5, // Limit each IP to 5 requests per windowMs
      message: 'Too many verification code requests from this IP, please try again after an hour.',
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });

    // Rate limiter for submitVerificationCode endpoint
    const submitVerificationLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute window
      max: 10, // Limit each IP to 10 attempts per windowMs
      message: 'Too many verification attempts, please try again after a minute.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Route to initiate verification
    app.post('/smsverify/start', requestVerificationLimiter, async (req, res) => {
      const { phoneNumber, channel } = req.body;
      const result = await startVerification(phoneNumber, channel);
      res.json(result);
    });

    // Route to check the verification code
    app.post('/smsverify/check', submitVerificationLimiter, async (req, res) => {
      const { phoneNumber, code, verificationSid } = req.body;
      var result;
      var phones = await User.find({phone:phoneNumber});
        if(phones.length > 0){
            result = {failed:true};
            return res.json(result);
        }
      result = await checkVerification(phoneNumber, code, verificationSid);
      if(result.success){
        var user = await User.findOne({_id: req.session.user._id});
        user.phone = phoneNumber;
        await user.save();
        req.session.user.phone = phoneNumber;
      }
      return res.json(result);
    });

    // Hook into passage creation to update feeds in real-time
    // Add this to your passage creation routes
    async function afterPassageCreation(newPassage) {
      try {
        // Find users who follow this author
        const followers = await Follower.find({ following: newPassage.author }).distinct('follower');
        
        // For followed authors, inject the new passage into their feed
        for (const followerId of followers) {
          // Get current cached feed
          const cacheKey = `user_feed:${followerId}`;
          const feedCache = await redis.get(cacheKey);
          
          if (feedCache) {
            const feedIds = JSON.parse(feedCache);
            
            // Insert at the beginning (or using a score-based position)
            feedIds.unshift(newPassage._id.toString());
            
            // Keep the feed at a reasonable size
            if (feedIds.length > 1000) feedIds.pop();
            
            // Update cache
            await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600);
          }
        }
        
        console.log(`Updated feeds for ${followers.length} followers of ${newPassage.author.username || newPassage.author.name}`);
      } catch (error) {
        console.error('Error in afterPassageCreation:', error);
      }
    }

    // Initialize the feed system during app startup
    async function initializeFeedSystem() {
      // Process the feed generation jobs
      feedQueue.process(async (job) => {
        const { userId } = job.data;
        const user = await User.findById(userId);
        
        if (!user) {
          console.error(`User ${userId} not found for feed generation`);
          return { success: false, error: 'User not found' };
        }
        
        try {
          // Generate the feed
          const relevantPassages = await getRelevantPassagesForUser(user);
          const scoredPassages = await scorePassages(relevantPassages, user);
          
          // Cache the results
          const feedIds = scoredPassages.map(item => item.passage._id.toString());
          await redis.set(
            `user_feed:${userId}`, 
            JSON.stringify(feedIds),
            'EX',
            3600 // 1 hour cache
          );
          
          return { success: true, userId, feedSize: feedIds.length };
        } catch (error) {
          console.error(`Error generating feed for user ${userId}:`, error);
          return { success: false, userId, error: error.message };
        }
      });
      
      // Schedule periodic feed updates for active users
      cron.schedule('0 */3 * * *', async () => { // Every 3 hours
        try {
          // Find active users (those who logged in within last 7 days)
          const activeTimeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const activeUsers = await User.find({
            lastLogin: { $gte: activeTimeThreshold }
          });
          
          console.log(`Scheduling feed updates for ${activeUsers.length} active users`);
          
          // Add jobs to queue with different priorities based on user activity
          for (const user of activeUsers) {
            const hoursSinceLastLogin = (Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60);
            
            // Determine job priority based on activity
            let priority = 3; // Default priority
            
            if (hoursSinceLastLogin < 24) {
              priority = 1; // High priority for very active users
            } else if (hoursSinceLastLogin < 72) {
              priority = 2; // Medium priority for moderately active users
            }
            
            // Schedule job
            await feedQueue.add(
              { userId: user._id.toString() },
              { priority }
            );
          }
        } catch (error) {
          console.error('Error scheduling feed updates:', error);
        }
      });
      
      console.log('Feed system initialized');
    }
    app.get('/feed-debug/', async (req, res) => {
  // const userId = req.params.userId;
  // const user = await getUser(req.session.user);
  const user = req.session.user;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Force regenerate without cache
  await redis.del(`user_feed:${user._id}`);
  
  // Enable console logging with capture
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog.apply(console, args);
  };
  
  const result = await generateFeedWithPagination(user, 1, 20);
  
  console.log = originalLog;
  
  res.json({
    logs: logs,
    feedCount: result.feed.length,
    firstFive: result.feed.slice(0, 5).map(p => ({
      id: p._id,
      title: p.title || p.content.substring(0, 50),
      author: p.author.username,
      stars: p.stars,
      date: p.date
    }))
  });
});
        /**
     * Generates a personalized feed with pagination for a user
     * Balances:
     * - Showing newer posts more frequently
     * - Occasionally showing older posts (no zero probability)
     * - Prioritizing posts with more stars
     * - Prioritizing posts used by others (especially different authors)
     * - Considering followed authors
     * 
     * @param {Object} user - The current user
     * @param {Number} page - Page number for pagination
     * @param {Number} limit - Number of items per page
     * @return {Object} Feed results with pagination info
     */
    async function generateFeedWithPagination(user, page = 1, limit = DOCS_PER_PAGE) {
      const cacheKey = `user_feed:${user._id}`;
      const CACHE_EXPIRATION = 3600; // 1 hour in seconds
      if (redisClient && redisClient.ready) {
        console.log("Redis available");
    }
      // Try to get cached feed IDs
      let feedCache = await redis.get(cacheKey);
      let feedIds;
      
      // If cache doesn't exist or is expired, generate the feed scores
      //!feedCache
      if (!feedCache) {
        console.log(`Generating new feed for user ${user._id}`);
        
        // Get filtering parameters
        const recentCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // Last 90 days
        const veryRecentCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days
        
        // Get followed authors
        const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
        
        // Initial filtering query to reduce the dataset
        const passageQuery = { 
          versionOf: null,
          personal: false,
          deleted: false,
          $or: [
            { author: { $in: followedAuthors } }, // From followed authors
            { date: { $gte: veryRecentCutoff } }, // Very recent content
            { "stars": { $gte: 0 } }, // Content with engagement
            { 
              date: { $gte: recentCutoff },
              "stars": { $gte: 0 } // Recent with some engagement
            }
          ],
          $or: [
            { content: { $ne: '' } },
            { code: { $ne: '' } }
          ]
        };
        
        // Get passages with initial filtering
        // Limit to a reasonable number for scoring (1000 is enough for most feeds)
        const passages = await Passage.find(passageQuery)
          .populate([
            { path: 'author' },
            { path: 'users' },
            { path: 'sourceList' },
            { path: 'parent' },
            { path: 'collaborators' },
            { path: 'versions' },
            { path: 'mirror' },
            { path: 'comments', select: 'author' }, // Only need author field from comments
            { path: 'passages', select: 'author' }  // Only need author field from sub-passages
          ])
          .sort('-stars -date')
          .limit(1000);
        // Score and rank passages
        const scoredPassages = await scorePassages(passages, user);
        
        // Extract IDs and save to cache
        feedIds = scoredPassages.map(item => item.passage._id.toString());
        await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', CACHE_EXPIRATION);
      } else {
        // Use cached feed IDs
        feedIds = JSON.parse(feedCache);
      }
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedIds = feedIds.slice(startIndex, endIndex);
      
      // Check if we have enough items for this page
      if (paginatedIds.length < limit && startIndex < feedIds.length) {
        // We're at the last page but have fewer items than the limit
        // This is normal, just use what we have
      } else if (paginatedIds.length === 0 && feedIds.length > 0) {
        // Page is beyond available results, redirect to last valid page
        const lastValidPage = Math.ceil(feedIds.length / limit);
        return { 
          redirect: true, 
          page: lastValidPage,
          totalPages: lastValidPage
        };
      }
      
      // Fetch full passage data for paginated IDs
      let feed = [];
      if (paginatedIds.length > 0) {
        feed = await Passage.find({ 
          _id: { $in: paginatedIds.map(id => mongoose.Types.ObjectId(id)) }
        }).populate('author users sourceList parent collaborators versions mirror');
        
        // Fill in usedIn data
        feed = await fillUsedInList(feed);
        
        // Sort according to the feed order (to maintain ranking)
        feed.sort((a, b) => {
          return paginatedIds.indexOf(a._id.toString()) - paginatedIds.indexOf(b._id.toString());
        });
      }
      
      // Return feed with pagination metadata
      return {
        feed,
        totalPages: Math.ceil(feedIds.length / limit),
        currentPage: page,
        totalItems: feedIds.length
      };
    }

    /**
     * Scores passages for feed ranking
     * 
     * @param {Array} passages - Array of passage objects to score
     * @param {Object} user - Current user
     * @return {Array} Scored and sorted passages
     */
    async function scorePassages(passages, user=null) {
      // Get list of authors the user follows
        if(user != null){
            var followedAuthors = await Follower.find({ user: user._id }).distinct('following');
        }
      // Track author counts as we go through the scoring
      const authorAppearances = {};
      const scoredPassages = [];

      
      for (const passage of passages) {
        const authorId = passage.author._id.toString();
        // Count this appearance (start at 0)
        authorAppearances[authorId] = (authorAppearances[authorId] || 0);
        // Get distinct authors who used this passage (excluding the original author)
        const usedByAuthors = await Passage.find({
          sourceList: { $in: [passage._id] },
          versionOf: null,
          author: { $ne: passage.author._id }
        }).distinct('author');
        
        // Calculate comment count based on passage type, excluding author's own comments
        let commentCount = 0;
        
        if (passage.private === true && passage.comments) {
          commentCount = passage.comments.filter(comment => 
            comment.author && comment.author.toString() !== passage.author._id.toString()
          ).length;
        } else if (passage.private === false && passage.passages) {
          commentCount = passage.passages.filter(subPassage => 
            subPassage.author && subPassage.author.toString() !== passage.author._id.toString()
          ).length;
        }
        
        // Apply logarithmic scaling to prevent dominance by any one factor
        const dateField = passage.createdAt || passage.date;
        const recencyScore = calculateRecencyScore(dateField);
        const starScore = Math.log10(passage.stars + 1) * 1.5; // Logarithmic scaling
        const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;
        const commentScore = Math.log10(commentCount + 1) * 1.5;
        
        // Apply social factor bonuses
        if(user != null){
            var followedAuthorBonus = followedAuthors.includes(passage.author._id.toString()) ? 1.3 : 1;
        }else{
            console.log("FLAIR");
            var followedAuthorBonus = 1;
        }

        // Apply author diversity penalty - stronger with each appearance
        // First appearance has no penalty (factor = 1.0)
        const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);
        
        // Stronger randomness factor (between 0.6 and 1.4)
        const randomnessFactor = 0.6 + (Math.random() * 0.8);
        
        // Calculate final score with weighted components
        const score = (
          (recencyScore * 0.35) +      // 35% weight for recency
          (starScore * 0.2) +          // 20% weight for stars
          (usedByScore * 0.25) +       // 15% weight for usage
          (commentScore * 0.15)        // 15% weight for comments
        ) * followedAuthorBonus * authorDiversityFactor * randomnessFactor;
        
        scoredPassages.push({
          passage,
          score,
          // Add debug info to help understand scoring (remove in production)
          // debug: {
          //   recency: recencyScore * 0.35,
          //   stars: starScore * 0.2,
          //   usedBy: usedByScore * 0.15,
          //   comments: commentScore * 0.15,
          //   authorBonus: followedAuthorBonus,
          //   random: randomnessFactor
          // }
        });
        // Increment author appearance count for next time
        authorAppearances[authorId]++;
      }
      
      // Add an additional shuffle step to further randomize when scores are close
      scoredPassages.sort((a, b) => {
        // If scores are within 10% of each other, randomize their order
        if (Math.abs(a.score - b.score) < (a.score * 0.1)) {
          return Math.random() - 0.5;
        }
        return b.score - a.score; // Otherwise use score order
      });
      
      console.log("Score distribution:", 
        scoredPassages.slice(0, 10).map(p => 
          JSON.stringify({id: p.passage._id.toString().substr(-4), score: p.score.toFixed(2)})
        )
      );
      
      return scoredPassages;
    }

    /**
     * Calculates a recency score with exponential decay
     * - New posts start with score 1.0
     * - Old posts decay to a minimum of 0.1 (never zero)
     * - This ensures older posts have some chance of appearing
     * 
     * @param {Date} createdAt - Creation date of the passage
     * @return {Number} Recency score between 0.1 and 1.0
     */
    function calculateRecencyScore(createdAt) {
      const now = new Date();
      const ageInDays = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
      
      // Exponential decay function:
      // - Starts at 1.0 for new posts
      // - Decays to 0.1 for very old posts
      // - Half-life of about 14 days (0.05 decay rate)
      return 0.1 + (0.9 * Math.exp(-0.05 * ageInDays));
    }

    /**
     * Updates the feed in the background
     * This should be called from a cron job or similar
     */
    async function scheduleBackgroundFeedUpdates() {
      try {
        // Find active users who have logged in recently
        const activeTimeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
        const activeUsers = await User.find({
          lastLogin: { $gte: activeTimeThreshold }
        });
        
        console.log(`Scheduling feed updates for ${activeUsers.length} active users`);
        
        // Process users in batches to avoid overwhelming the system
        const batchSize = 50;
        
        for (let i = 0; i < activeUsers.length; i += batchSize) {
          const batch = activeUsers.slice(i, i + batchSize);
          
          // Process each user in the batch
          await Promise.all(batch.map(async (user) => {
            try {
              const hoursSinceLastLogin = (Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60);
              
              // Determine refresh frequency based on activity
              let refreshInterval;
              if (hoursSinceLastLogin < 24) {
                refreshInterval = 3 * 60 * 60 * 1000; // 3 hours for very active users
              } else if (hoursSinceLastLogin < 72) {
                refreshInterval = 6 * 60 * 60 * 1000; // 6 hours for moderately active users
              } else {
                refreshInterval = 12 * 60 * 60 * 1000; // 12 hours for less active users
              }
              
              // Use the job queue system to schedule feed updates
              await feedQueue.add(
                { userId: user._id.toString() },
                { 
                  repeat: { every: refreshInterval },
                  jobId: `feed-update-${user._id}`
                }
              );
            } catch (error) {
              console.error(`Error scheduling feed update for user ${user._id}:`, error);
            }
          }));
          
          // Small delay between batches to reduce database load
          if (i + batchSize < activeUsers.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        console.log(`Completed scheduling feed updates`);
      } catch (error) {
        console.error('Error in scheduleBackgroundFeedUpdates:', error);
      }
    }

    /**
     * Process the feed generation job from the queue
     */
    async function processFeedGenerationJob(job) {
      const { userId } = job.data;
      
      try {
        console.log(`Processing feed update for user ${userId}`);
        
        const user = await User.findById(userId);
        if (!user) {
          console.error(`User ${userId} not found when processing feed update`);
          return { success: false, error: 'User not found' };
        }
        
        // Get filtered passages for this user
        const relevantPassages = await getRelevantPassagesForUser(user);
        
        // Score passages
        const scoredPassages = await scorePassages(relevantPassages, user);
        
        // Extract IDs and cache the feed
        const feedIds = scoredPassages.map(item => item.passage._id.toString());
        const cacheKey = `user_feed:${userId}`;
        
        await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600); // 1 hour cache
        
        return { 
          success: true, 
          userId,
          feedSize: feedIds.length
        };
      } catch (error) {
        console.error(`Error in processFeedGenerationJob for user ${userId}:`, error);
        return { 
          success: false, 
          userId,
          error: error.message
        };
      }
    }

    /**
     * Get relevant passages for a user's feed with efficient filtering
     */
    async function getRelevantPassagesForUser(user, limit = 1000) {
      // Get followed authors
      const followedAuthors = await Follower.find({ user: user._id }).distinct('following');
      
      // Time windows
      const veryRecentCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 1 week
      const recentCutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)); // 3 months
      
      // First-stage filtering
      const query = {
        versionOf: null,
        deleted: false,
        personal: false,
        $or: [
          { author: { $in: followedAuthors } }, // From followed authors
          { date: { $gte: veryRecentCutoff } }, // Very recent content
          { "stars": { $gte: 0 } }, // Content with engagement
          { 
            date: { $gte: recentCutoff },
            stars: { $gte: 0 } // Recent with some engagement
          }
        ]
      };
      
      // Get passages with filtered query
      const passages = await Passage.find(query)
        .populate([
            { path: 'author' },
            { path: 'users' },
            { path: 'sourceList' },
            { path: 'parent' },
            { path: 'collaborators' },
            { path: 'versions' },
            { path: 'mirror' },
            { path: 'comments', select: 'author' }, // Only need author field from comments
            { path: 'passages', select: 'author' }  // Only need author field from sub-passages
          ])
        .sort('-stars -date')
        .limit(1000);
      
      return passages;
    }

    // Add this to your feed API endpoint
    async function handleFeedRequest(req, res) {
      try {
        const user = req.user;
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        
        // Generate or retrieve feed
        const feedResult = await generateFeedWithPagination(user, page, limit);
        
        // Check if we need to redirect to a different page
        if (feedResult.redirect) {
          return res.json({
            redirect: true,
            page: feedResult.page,
            totalPages: feedResult.totalPages
          });
        }
        
        // Return feed data
        return res.json({
          feed: feedResult.feed,
          totalPages: feedResult.totalPages,
          currentPage: feedResult.currentPage,
          totalItems: feedResult.totalItems
        });
      } catch (error) {
        console.error('Error generating feed:', error);
        return res.status(500).json({ error: 'Could not generate feed' });
      }
    }

    /**
     * Add this to your app setup
     */
    function initFeedSystem() {
      // Set up the feed queue processor
      feedQueue.process(async (job) => {
        return await processFeedGenerationJob(job);
      });
      
      // Schedule initial background updates
      scheduleBackgroundFeedUpdates();
      
      // Schedule regular runs of the background updater
      cron.schedule('0 */6 * * *', async () => { // Every 6 hours
        await scheduleBackgroundFeedUpdates();
      });
    }

    // Utility function to handle real-time injection of important content
    async function injectHighPriorityContent(newPassage, maxFeedsToUpdate = 100) {
      try {
        // Only inject if the passage is significant
        if (newPassage.author && (newPassage.stars > 10 || newPassage.usedByDifferentAuthorsCount > 3)) {
          console.log(`Injecting high-priority content ${newPassage._id} into user feeds`);
          
          // Find followers of this author
          const followers = await Follower.find({ following: newPassage.author._id }).limit(maxFeedsToUpdate);
          
          // Inject content into their feeds
          for (const follower of followers) {
            const cacheKey = `user_feed:${follower.user}`;
            const cachedFeed = await redis.get(cacheKey);
            
            if (cachedFeed) {
              const feedIds = JSON.parse(cachedFeed);
              
              // Insert at a high position (not necessarily the top)
              // This preserves some randomness while ensuring visibility
              const insertPosition = Math.min(5, Math.floor(feedIds.length * 0.1));
              feedIds.splice(insertPosition, 0, newPassage._id.toString());
              
              // Update cache with the new feed order
              await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', 3600);
            }
          }
        }
      } catch (error) {
        console.error('Error injecting high priority content:', error);
      }
    }

    /**
     * Generates a feed for non-logged-in users
     * @param {Number} page - Page number for pagination
     * @param {Number} limit - Number of items per page
     * @return {Object} Feed results with pagination info
     */
    async function generateGuestFeed(page = 1, limit = DOCS_PER_PAGE) {
      // Unique cache key for guest feed
      const cacheKey = `guest_feed:v1`;
      const CACHE_EXPIRATION = 300; // 5 minutes
      
      let feedIds = null;
      // Try to get from cache if Redis is available
      if (redisClient && redisClient.ready) {
        console.log("Redis available");
        try {
          const feedCache = await redis.get(cacheKey);
          if (feedCache) {
            console.log('feedcache:'+cacheKey);
            console.log(feedIds);
            feedIds = JSON.parse(feedCache);
            console.log('feedids2:'+feedIds);
          }
        } catch (error) {
          console.error('Redis error when getting guest feed cache:', error);
        }
      }
      var SYSTEM = await System.findOne({});
      var lastUpdateOnFile = new Date(process.env.LAST_UPDATE);
      console.log(lastUpdateOnFile);
      console.log(SYSTEM.lastUpdate)
      if((await System.findOne({lastUpdate: {$exists:true}})) == null){
        SYSTEM.lastUpdate = Date.now();
        await SYSTEM.save();
      }
      //if the last manual update was after the last soft update
      if(lastUpdateOnFile > SYSTEM.lastUpdate){
        //generate a new feed
        var pass = true;
        SYSTEM.lastUpdate = lastUpdateOnFile;
        await SYSTEM.save();
        console.log("Updated guest feed");
      }else{
        var pass = false; //show cached feed
      }
      console.log('Feedids:'+(feedIds));
      // If not in cache or Redis unavailable, generate the feed
      //!feedIds || pass
      if (!feedIds || pass) {
        console.log('Generating new guest feed');
        
        // Define time windows
        const recentCutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // Last 30 days
        const veryRecentCutoff = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)); // Last 3 days
        
        // Query to efficiently filter passages
        const query = {
          versionOf: null,
          deleted: false,
          personal: false,
          simulated: false,
          $or: [
            { date: { $gte: veryRecentCutoff } }, // Very recent content
            { stars: { $gte: 0 } }, // Popular content would be 5
            { 
              date: { $gte: recentCutoff },
              stars: { $gte: 2 } // Recent content with some engagement
            }
          ],
          $or: [
            { content: { $ne: '' } },
            { code: { $ne: '' } }
          ]
        };
        
        // First, just get IDs and minimal data needed for scoring
        const minimalPassages = await Passage.find(query)
          .select('_id author stars date')
          .limit(500);
        
        // Get IDs list for additional queries
        const passageIds = minimalPassages.map(p => p._id);
        
        // Get comment counts with a single aggregation query
        const commentCounts = await Passage.aggregate([
          { $match: { _id: { $in: passageIds } } },
          { $project: {
            commentCount: { 
              $cond: {
                if: { $eq: ["$private", true] },
                then: {
                  $size: {
                    $filter: {
                      input: "$comments",
                      as: "comment",
                      cond: { $ne: ["$$comment.author", "$author"] }
                    }
                  }
                },
                else: {
                  $size: {
                    $filter: {
                      input: "$passages",
                      as: "subpassage",
                      cond: { $ne: ["$$subpassage.author", "$author"] }
                    }
                  }
                }
              }
            }
          }}
        ]);
        
        // Create a lookup map for comment counts
        const commentCountMap = commentCounts.reduce((map, item) => {
          map[item._id.toString()] = item.commentCount || 0;
          return map;
        }, {});
        
        // Get usage counts with a single query
        const usageCounts = await Passage.aggregate([
          { $match: { sourceList: { $in: passageIds } } },
          { $group: {
            _id: "$sourceList",
            usedByAuthors: { $addToSet: "$author" }
          }}
        ]);
        
        // Create a lookup map for usage counts
        const usageCountMap = {};
        for (const usage of usageCounts) {
          const sourceId = usage._id.toString();
          usageCountMap[sourceId] = (usageCountMap[sourceId] || []).concat(usage.usedByAuthors);
        }
        // Track author counts as we go through the scoring
        const authorAppearances = {};
        // Score passages using the maps
        const scoredPassages = [];
        for (const passage of minimalPassages) {
            const authorId = passage.author._id.toString();
            // Count this appearance (start at 0)
            authorAppearances[authorId] = (authorAppearances[authorId] || 0);
          const passageId = passage._id.toString();
          
          // Get counts from maps
          const commentCount = commentCountMap[passageId] || 0;
          const usedByAuthors = usageCountMap[passageId] || [];
          
          // Calculate scoresgenerateGuestFeed
          const recencyScore = calculateRecencyScore(passage.date);
          const starScore = Math.log10(passage.stars + 1) * 2;
          const commentScore = Math.log10(commentCount + 1) * 1.5;
          const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;
          
          // Apply author diversity penalty - stronger with each appearance
            // First appearance has no penalty (factor = 1.0)
            const authorDiversityFactor = 1 / (1 + authorAppearances[authorId] * 0.2);

          // Randomness factor
          const randomnessFactor = 0.7 + (Math.random() * 0.6);
          
          // Calculate final score
          const score = (
            (recencyScore * 0.3) +
            (starScore * 0.3) +
            (usedByScore * 0.2) +
            (commentScore * 0.2)
          ) * authorDiversityFactor * randomnessFactor;
          
          scoredPassages.push({
            passageId: passage._id,
            score
          });
        }
        
        // Sort and get IDs
        scoredPassages.sort((a, b) => b.score - a.score);
        feedIds = scoredPassages.map(item => item.passageId.toString());
        // Cache the IDs
        if (redisClient && redisClient.ready) {
          try {
            console.log("Setting cacheKey");
            console.log(feedIds);
            await redis.set(cacheKey, JSON.stringify(feedIds), 'EX', CACHE_EXPIRATION);
          } catch (error) {
            console.error('Redis error when setting guest feed cache:', error);
          }
        }
      }
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
       // Double-check it's an array
    if (!Array.isArray(feedIds)) {
      console.error('Generated feedIds is not an array:', feedIds);
      feedIds = [];
    }
      const paginatedIds = feedIds.slice(startIndex, endIndex);
      
      // Check pagination bounds
      if (paginatedIds.length === 0 && feedIds.length > 0) {
        const lastValidPage = Math.ceil(feedIds.length / limit);
        return { 
          redirect: true, 
          page: lastValidPage,
          totalPages: lastValidPage
        };
      }
      
      // Only now fetch the full passages needed for this page
      let feed = [];
      if (paginatedIds.length > 0) {
        feed = await Passage.find({ 
          _id: { $in: paginatedIds }
        }).populate('author users sourceList parent collaborators versions mirror');
        
        // Fill in usedIn lists
        feed = await fillUsedInList(feed);
        
        // Sort according to the feed order
        feed.sort((a, b) => {
          return paginatedIds.indexOf(a._id.toString()) - paginatedIds.indexOf(b._id.toString());
        });
      }
      
      return {
        feed,
        totalPages: Math.ceil(feedIds.length / limit),
        currentPage: page,
        totalItems: feedIds.length
      };
    }

    /**
     * Score passages for guest feed (without follower data)
     * @param {Array} passages - Array of passage documents
     * @return {Array} Scored passages sorted by score
     */
    async function scoreGuestPassages(passages) {
      const scoredPassages = [];
      
      for (const passage of passages) {
        // Get distinct authors who used this passage (excluding the original author)
        const usedByAuthors = await Passage.find({
          sourceList: { $in: [passage._id] },
          versionOf: null,
          author: { $ne: passage.author._id }
        }).distinct('author');
        
        // Calculate comment count based on passage type, excluding author's own comments
        let commentCount = 0;
        
        if (passage.private === true && passage.comments) {
          commentCount = passage.comments.filter(comment => 
            comment.author && comment.author.toString() !== passage.author._id.toString()
          ).length;
        } else if (passage.private === false && passage.passages) {
          commentCount = passage.passages.filter(subPassage => 
            subPassage.author && subPassage.author.toString() !== passage.author._id.toString()
          ).length;
        }
        
        // Apply logarithmic scaling to prevent dominance by any one factor
        const dateField = passage.createdAt || passage.date;
        const recencyScore = calculateRecencyScore(dateField);
        const starScore = Math.log10(passage.stars + 1) * 2; // Weighted higher for guest feed
        const usedByScore = Math.log10(usedByAuthors.length + 1) * 1.5;
        const commentScore = Math.log10(commentCount + 1) * 1.5;
        
        // Stronger randomness factor for guest feed (between 0.7 and 1.3)
        const randomnessFactor = 0.7 + (Math.random() * 0.6);
        
        // Calculate final score with weighted components
        // Note: For guest feeds, we emphasize stars and comments more
        const score = (
          (recencyScore * 0.3) +       // 30% weight for recency
          (starScore * 0.3) +          // 30% weight for stars (higher for guests)
          (usedByScore * 0.2) +        // 20% weight for usage
          (commentScore * 0.2)         // 20% weight for comments
        ) * randomnessFactor;
        
        scoredPassages.push({
          passage,
          score
        });
      }
      
      // Add randomization for similar scores
      scoredPassages.sort((a, b) => {
        // If scores are within 15% of each other, add some randomness
        if (Math.abs(a.score - b.score) < (a.score * 0.15)) {
          return Math.random() - 0.5;
        }
        return b.score - a.score;
      });
      
      return scoredPassages;
    }

async function getPassagesByUsage(options = {}) {
  const { 
    limit = 100,
    timeRange = null,
    minUsageCount = 1,
    excludeVersions = true,
    cursor = null,
    author = null  // Add author parameter with default null
  } = options;
  
  const pipeline = [
    {
      $match: {
        sourceList: { $exists: true, $ne: [] },
        personal: false,
        deleted: false,
        versionOf: null
      }
    },
    { $unwind: "$sourceList" },
    {
      $lookup: {
        from: "Passages",
        localField: "sourceList",
        foreignField: "_id",
        as: "referencedPassage"
      }
    },
    { $unwind: "$referencedPassage" },
    {
      $addFields: {
        isSelfReference: { $eq: ["$author", "$referencedPassage.author"] }
      }
    },
    {
      $group: {
        _id: "$sourceList",
        totalCount: { $sum: 1 },
        nonSelfCount: { 
          $sum: { $cond: [{ $not: "$isSelfReference" }, 1, 0] }
        },
        passageDetails: { $first: "$referencedPassage" }
      }
    },
    {
      $match: {
        nonSelfCount: { $gte: minUsageCount },
        "passageDetails.personal": false,
        "passageDetails.deleted": false,
        ...(excludeVersions ? { "passageDetails.versionOf": null } : {}),
        ...(timeRange ? { "passageDetails.date": { $gte: timeRange } } : {}),
        ...(author ? { "passageDetails.author": author } : {})  // Add author filter
      }
    },
    { $sort: { nonSelfCount: -1, "passageDetails.date": -1, _id: 1 } }
  ];
  
  if (cursor) {
    const { usageCount, date, _id } = JSON.parse(cursor);
    pipeline.push({
      $match: {
        $or: [
          { nonSelfCount: { $lt: usageCount } },
          { 
            nonSelfCount: usageCount,
            "passageDetails.date": { $lt: date }
          },
          {
            nonSelfCount: usageCount,
            "passageDetails.date": date,
            _id: { $gt: _id }
          }
        ]
      }
    });
  }
  
  pipeline.push(
    { $limit: limit + 1 },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            "$passageDetails",
            { usageCount: "$nonSelfCount" }
          ]
        }
      }
    }
  );
  
  const results = await Passage.aggregate(pipeline);
  
  const hasMore = results.length > limit;
  if (hasMore) {
    results.pop();
  }
  
  let nextCursor = null;
  if (hasMore && results.length > 0) {
    const lastItem = results[results.length - 1];
    nextCursor = JSON.stringify({
      usageCount: lastItem.usageCount,
      date: lastItem.date,
      _id: lastItem._id
    });
  }
  
  const populatedResults = await Passage.populate(results, { path: 'author' });
  
  return {
    passages: populatedResults,
    nextCursor,
    hasMore
  };
}
    // Example usage:
    async function showPopularByUsage() {
      const passages = await getPassagesSortedByUsage({
        limit: 50,
        minUsageCount: 2,
        timeRange: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // Last 180 days
      });
      
      console.log("Most referenced passages:");
      passages.forEach((passage, index) => {
        console.log(`${index + 1}. "${passage.title || passage.content.slice(0, 50)}..."`);
        console.log(`   Used ${passage.usageCount} times by ${passage.uniqueAuthors} different authors`);
        console.log(`   By: ${passage.author.username}`);
        console.log(`   Stars: ${passage.stars}`);
        console.log("-------------------");
      });
    }

    // Initialize the feed system during app startup
    // Add this near the end of your app initialization code
    (async function() {
      try {
        console.log('Initializing feed system...');
        
        // Initialize Redis client without using connect()
        redisClient = redis.createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          retry_strategy: function(options) {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              console.error('Redis connection refused. Retrying...');
              return Math.min(options.attempt * 100, 3000);
            }
            return Math.min(options.attempt * 100, 3000);
          }
        });

        redisClient.on('error', (error) => {
          console.error('Redis client error:', error);
        });

        redisClient.on('ready', () => {
          console.log('Connected to Redis');
        });

        // Promisify Redis methods for easier async/await usage
        redis.get = promisify(redisClient.get).bind(redisClient);
        redis.set = promisify(redisClient.set).bind(redisClient);
        redis.del = promisify(redisClient.del).bind(redisClient);
        redis.keys = promisify(redisClient.keys).bind(redisClient);
        redis.exists = promisify(redisClient.exists).bind(redisClient);
        redis.zadd = promisify(redisClient.zadd).bind(redisClient);
        redis.zrevrange = promisify(redisClient.zrevrange).bind(redisClient);
        
        // Initialize Bull queue for background processing
        feedQueue.on('error', (error) => {
          console.error('Feed queue error:', error);
        });
        
        // Process feed generation jobs
        feedQueue.process(async (job) => {
          return await processFeedGenerationJob(job);
        });
        
        // Add monitoring endpoints
        setupFeedMonitoringEndpoint(app, requiresAdmin);
        setupEngagementEndpoint(app);
        
        // Schedule initial feed updates for active users
        const startupDelay = 10 * 1000; // 10 seconds
        setTimeout(async () => {
          try {
            await scheduleBackgroundFeedUpdates();
            console.log('Initial feed updates scheduled');
          } catch (error) {
            console.error('Error scheduling initial feed updates:', error);
          }
        }, startupDelay);
        
        console.log('Feed system initialized');
      } catch (error) {
        console.error('Error initializing feed system:', error);
      }
    })();

    async function gracefulShutdown(signal) {
      console.log(`Received ${signal}. Starting graceful shutdown...`);
      isShuttingDown = true;

      server.close(async (err) => { // Use your 'server' instance here
        console.log('Server stopped accepting new connections.');
        if (err) {
          console.error('Error during server close:', err);
          process.exit(1);
        }

        const shutdownTimeout = 10000; // 10 seconds
        const startTime = Date.now();

        // You might need a different way to track in-flight requests
        // if you're not solely relying on Express's internal mechanisms.
        // This example assumes Express is handling requests.
        while (Date.now() - startTime < shutdownTimeout && app._events.requestCount > 0) {
          console.log(`Waiting for ${app._events.requestCount} requests to complete...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }

        console.log('All in-flight requests finished (or timeout reached).');

        // Close MongoDB connection
        try {
          await mongoose.connection.close();
          console.log('MongoDB connection closed through graceful shutdown.');
        } catch (err) {
          console.error('Error during MongoDB shutdown:', err);
          process.exit(1);
        }
        // Close Socket.IO connections if you're using it
        if (io) {
          io.close(() => {
            console.log('Socket.IO server closed.');
            console.log('Graceful shutdown complete. Exiting.');
            process.exit(0);
          });
        } else {
          console.log('Graceful shutdown complete. Exiting.');
          process.exit(0);
        }
      });
    }
    // CLOSING LOGIC
    server.listen(PORT, () => {
        console.log(`Sasame started on Port ${PORT}`);
        io.sockets.emit("serverRestart", "Test");
    });
    process.on('uncaughtException', function(err){
        console.log('uncaughtExceptionError ' + err);
        console.log(err);
        // server.close();
    });
    // Listen for SIGINT (Ctrl+C)
    process.on('SIGINT', gracefulShutdown);

    // Listen for SIGTERM (PM2 shutdown)
    process.on('SIGTERM', gracefulShutdown);

    // Middleware to track in-flight requests (basic example for Express)
    app.use((req, res, next) => {
      if (!isShuttingDown) {
        app._events.requestCount = (app._events.requestCount || 0) + 1;
        res.on('finish', () => {
          app._events.requestCount--;
        });
      }
      next();
    });

    app.get('/health', (req, res) => {
      res.sendStatus(isShuttingDown ? 503 : 200); // 503 if shutting down
    });

    //debugging
    /**
     * 
    (async function(){
        var passage = await GETPASSAGE('63faabffa5dc86b7e4d28180');
        document.write(passage);
    })();

    */

})();
