'use strict';
const express = require('express');
const fileUpload = require('express-fileupload');
const querystring = require('querystring');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const bodyParser = require("body-parser");
const helmet = require('helmet');
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

// Models
const User = require('./models/User');
const Passage = require('./models/Passage');
const Interaction = require('./models/Interaction');
const Category = require('./models/Category');
const Subcat = require('./models/Subcat');
const Subforum = require('./models/Subforum');
const Visitor = require('./models/Visitor');
const Follower = require('./models/Follower');
const Notification = require('./models/Notification');
const Star = require('./models/Star');
// Controllers
const passageController = require('./controllers/passageController');
// Routes
// const passageRoutes = require('./routes/passage');

var fs = require('fs'); 
var path = require('path');
const { exec } = require('child_process');
const { v4 } = require('uuid');

const FormData = require('form-data');

const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
//pagination for home and profile
const DOCS_PER_PAGE = 10; // Documents per Page Limit (Pagination)

// Database Connection Setup
mongoose.connect(process.env.MONGODB_CONNECTION_URL, {
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

//socket io
const io = require('socket.io')(server);
const BKP = require('mongodb-snapshot');
async function mongoSnap(path, restore = false) {
    console.log("TEST");
    const mongo_connector = new BKP.MongoDBDuplexConnector({
        connection: { uri: process.env.MONGODB_CONNECTION_URL, dbname: 'sasame' }
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
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
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
  
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

const MongoStore  = require('connect-mongo');

// User Session Setup Logic
// const session = require('express-session')({
//     secret: "ls",
//     resave: true,
//     saveUninitialized: true,
//     store: MongoStore.create({ mongoUrl: process.env.MONGODB_CONNECTION_URL })
// });
const session = require('express-session')({
    secret: "ls",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGODB_CONNECTION_URL,
        ttl: 24 * 60 * 60, // 1 day TTL
        autoRemove: 'native',
        touchAfter: 24 * 3600 // Only update sessions every 24 hours
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
});
var sharedsession = require("express-socket.io-session");
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const scripts = {};
scripts.isPassageUser = function(user, passage){
    if(typeof user == 'undefined'){
        return false;
    }
    var ret;
    if(user._id.toString() == passage.author._id.toString()){
        return true;
    }
    var i = 0;
    for(const u of passage.users){
        if(u._id.toString() == user._id.toString()){
            return true;
        }
    }
    return false;
};
scripts.getCategoryTopicsNum = function (cat) {
    var num = 0;
    for(var c of cat.passages){
        if(c.forumType != 'subforum'){
            ++num;
        }
    }
    return num;
};
scripts.getNumPosts = function (cat){
    var num = 0;
    for(var c of cat.passages){
        if(c.forumType != 'subforum'){
            // ++num;
            num += c.passages.length;
        }
    }
    return num;
};
//for categories
scripts.lastPost = function(cat){
    if(cat.passages && cat.passages.length > 0){
    var passage = cat.passages.at(-1);
    return 'by ' + passage.author.name + '<br>' + passage.date.toLocaleDateString();
    }
    else{
        return 'No Posts Yet.'
    }
};
scripts.getNumViews = async function(id){
    var views = await Visitor.countDocuments({visited:id});
    // if(views == '' || !views){
    //     return 0;
    // }
    return views;
}
scripts.getMaxToGiveOut = async function(){
    let users = await User.find({stripeOnboardingComplete: true});
    const maxAmountPerUser = 100; //ofc they can get more than this; this is just number for if they all had equal portion
    var maxToGiveOut = maxAmountPerUser * users.length * 100;
    var usd = parseInt(await totalUSD());
    if(maxToGiveOut > usd){
        usd = usd;
    }
    else if(maxToGiveOut < usd){
        usd = maxToGiveOut;
    }
    return usd;
}
scripts.getBest = async function(passage){
    return await getPassage(await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('author users'));
};
// scripts.getPassage = async function(passage){
//     return await getPassage(await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}}).populate('author users'));
// };
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
    if(['notifications', 'feed', 'posts', 'comments', 'subforums', 'profile', '', 'passage', 'messages', 'leaderboard', 'donate', 'filestream', 'loginform', 'personal', 'admin', 'forum', 'projects', 'tasks', 'recover', 'recoverpassword'].includes(req.url.split('/')[1])){
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


//CRON
var cron = require('node-cron');
const { exit } = require('process');
const { response } = require('express');
const e = require('express');
const Message = require('./models/Message');
const { copyPassage } = require('./controllers/passageController');
const Bookmark = require('./models/Bookmark');
// const { getMode } = require('ionicons/dist/types/stencil-public-runtime');
//run monthly cron
cron.schedule('0 12 1 * *', async () => {
    await rewardUsers();
    console.log('Monthly Cron ran at 12pm.');
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
//Get total star count and pay out users
async function rewardUsers(){
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    var users = await User.find({stripeOnboardingComplete:true});
    var usd = await scripts.getMaxToGiveOut();
    var cut;
    var totalCut = 0;
    for(const user of users){
        // if(!user.paymentsLocked){
            //appropriate percentage based on stars
            //users get same allotment as they have percentage of stars
            let userUSD = parseInt((await percentStars(user.starsGiven)) * usd);
            try{
                // if(user.amountEarnedThisYear + (userUSD/100) > 600){
                //     userUSD = 600 - user.amountEarnedThisYear;
                // }
                cut = (userUSD*0.05);
                const transfer = await stripe.transfers.create({
                    //take 5%
                    amount: Math.floor(userUSD - (cut)),
                    currency: "usd",
                    destination: user.stripeAccountId,
                });
                totalCut += cut;
                // if(user.amountEarnedThisYear + (userUSD/100) > 600){
                //     user.amountEarned += 600 - user.amountEarnedThisYear;
                //     user.amountEarnedThisYear += 600 - user.amountEarnedThisYear;
                //     user.paymentsLocked = true;
                // }else{
                //     user.amountEarned += userUSD / 100;
                //     user.amountEarnedThisYear += userUSD / 100;
                // }
            }
            catch(err){
                console.log(err);
            }
        // }
    }
    console.log("Users paid");
    //pay the platform the leftover money
    const payout = await stripe.payouts.create({
      amount: Math.floor(totalCut),
      currency: 'usd',
    });
}
// for testing
// (async function(){
//     await rewardUsers();
// })();
//get percentage of total stars
async function percentStars(user_stars){
    let final = user_stars / (await totalStars());
    return final;
}
//get percentage of total usd
async function percentUSD(donationUSD){
    var amount = await totalUSD();
    if(amount == 0){
        return 1;
    }
    let final = donationUSD / (amount);
    return final;
}
async function totalUSD(){
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const balance = await stripe.balance.retrieve();
    var usd = 0;
    for(const i of balance.available){
        if(i.currency == 'usd'){
            usd = i.amount;
            break;
        }
    }
    return usd;
}
async function totalStars(){
    let users = await User.find({stripeOnboardingComplete: true});
    if(users == false){
        return 0;
    }
    var stars = 0;
    for(const user of users){
        stars += user.starsGiven;
    }
    return stars;
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
async function starPassage(req, amount, passageID, userID, deplete=true){
    let user = await User.findOne({_id: userID});
    //infinite stars on a local sasame
    if(user.stars < amount && process.env.REMOTE == 'true'){
        return "Not enough stars.";
    }
    if(deplete){
        user.stars -= amount;
    }
    let passage = await Passage.findOne({_id: passageID}).populate('author sourceList');
    var lastSource = await getLastSource(passage);
    var bonus = 0;
    //calculate bonus
    for(const source of passage.sourceList){
        if(passage.author._id.toString() != source.author._id.toString()){
            var similarity = passageSimilarity(passage, source);
            bonus += similarity > 0.1 ? similarity : 0;
        }
    }
    bonus = bonus * amount;
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
    //if bubbling star all sub passages (content is displayed in parent)
    if(passage.bubbling && passage.passages && !passage.public){
        for(const p of passage.passages){
            //also star sources for each sub passage
            passage.sourceList = [...passage.sourceList, ...p.sourceList];
            await starPassage(req, amount, p._id, userID, false);
        }
    }
    await starMessages(passage._id, amount);
    //you have to star someone elses passage to get stars
    if(passage.author._id.toString() != req.session.user._id.toString() && !passage.collaborators.includes(req.session.user._id.toString())){
        user.starsGiven += amount;
        if(passage.collaborators.length > 0){
            passage.author.stars += (amount + bonus)/(passage.collaborators.length + 1);
        }
        else{
            passage.author.stars += amount + bonus;
        }
        //give stars to collaborators if applicable
        //split stars with collaborators
        if(passage.collaborators.length > 0){
            for(const collaborator in passage.collaborators){
                if(collaborator == passage.author.email){
                    //we already starred the author
                    continue;
                }
                let collaber = await User.findOne({email:collaborator});
                if(collaber != null){
                    collaber.stars += (amount + bonus)/(passage.collaborators.length + 1);
                    await collaber.save();
                }
            }
        }
        await passage.author.save();
    }
    await user.save();
    await passage.save();
    //star each source
    var i = 0;
    var authors = [];
    //add sources for best,bestof,and mirror
    if(passage.showBestOf){
        var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
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
    //recursively star ssources
    await starSources(passage, passage, [], [], amount, req);
    return await fillUsedInListSingle(passage);
}
async function starSources(passage, top, authors=[], starredPassages=[], amount, req){
    var i = 0;
    var bonus;
    for(const source of passage.sourceList){
        //don't star same passage twice
        if(!starredPassages.includes(source._id.toString())){
            await starMessages(source._id, amount);
            let sourceAuthor = await User.findOne({_id: source.author._id});
            //you won't get extra stars for citing your own work
            //also give author stars once per author
            if(sourceAuthor._id.toString() != req.session.user._id.toString() 
                && sourceAuthor._id.toString() != passage.author._id.toString()
                /*&& !authors.includes(sourceAuthor._id)*/){
                bonus = passageSimilarity(top, source);
                bonus = 0; //bonuses are to reward users for citing
                source.stars += amount + bonus;
                //dont give author stars if starrer is a collaborator
                if(!source.collaborators.includes(req.session.user._id.toString())){
                    if(!authors.includes(sourceAuthor._id)){
                        sourceAuthor.stars += amount + bonus/(source.collaborators.length + 1);
                        await sourceAuthor.save();
                    }
                }
                authors.push(sourceAuthor._id);
                await source.save();
                //dont give collaborators stars if starrer is a collaborator
                if(!source.collaborators.includes(req.session.user._id.toString())){
                    //give stars to collaborators if applicable
                    //split stars with collaborators
                    if(source.collaborators.length > 0){
                        for(const collaborator in source.collaborators){
                            if(collaborator == passage.author.email){
                                //we already starred the author
                                continue;
                            }
                            let collaber = await User.findOne({email:collaborator});
                            if(collaber != null){
                                collaber.stars += (amount + bonus)/(source.collaborators.length + 1);
                                await collaber.save();
                            }
                        }
                    }   
                }
            }
            starredPassages.push(source._id.toString());
        }
        await starSources(source, passage, authors, starredPassages);
        ++i;
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
    return await Passage.find({title:title, personal: false}).sort('-stars').limit(1)[0];
}
//get best passage in best module for passage
//hard to tell the difference from the above function
//still thinking about it...
//but this is better (more useful), I think...
async function bestOfPassage(title){
    var parent = await Passage.find({title:title, public: true, personal: false}).sort('-stars').limit(1)[0];
    if(parent != null){
        var sub = await Passage.find({parent: parent._id, personal: false}).sort('-stars').limit(1);
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
    usd = parseInt((await percentStars(profile.starsGiven)) * (await scripts.getMaxToGiveOut()));
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
    res.render("profile", {usd: usd, subPassages: false, passages: passages, scripts: scripts, profile: profile,
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
app.get('/loginform', function(req, res){
    res.render('login_register', {scripts: scripts});
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
//             var final = data.replaceAll("/css/", "https://christianengineeringsolutions.com/css/");
//             var final = data.replaceAll("/js/", "https://christianengineeringsolutions.com/js/");
//             var final = data.replaceAll("/images/", "https://christianengineeringsolutions.com/images/");
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

          var url = 'https://christianengineeringsolutions.com/pull';
          //TODO add file
          var file = await fsp.readFile('./dist/uploads/' + passage.filename, "base64");
          var data = querystring.stringify({
            passage : JSON.stringify(passage),
            file: file
        });
          var options = {
              hostname: 'christianengineeringsolutions.com',
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
        const request = https.get('https://christianengineeringsolutions.com/uploads/' + passage.filename, function(response){
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
            return res.send('https://christianengineeringsolutions.com/passage/' + encodeURIComponent(copy.title) + '/' + copy._id);
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
    const remoteURL = 'https://christianengineeringsolutions.com' + route;
    var output = '';
    var request = https.request(remoteURL, function(response){
        response.setEncoding('utf8');
        response.on('data', function(data){
            var final = data.replaceAll("/css/", "https://christianengineeringsolutions.com/css/");
            final = final.replaceAll("/js/", "https://christianengineeringsolutions.com/js/");
            final = final.replaceAll("/eval/", "https://christianengineeringsolutions.com/eval/");
            final = final.replaceAll("/images/", "https://christianengineeringsolutions.com/images/");
            final = final.replaceAll("/jquery", "https://christianengineeringsolutions.com/jquery");
            final = final.replaceAll("https://unpkg.com/three@0.87.1/exampleshttps://christianengineeringsolutions.com/js/loaders/GLTFLoader.js", "https://unpkg.com/three@0.87.1/examples/js/loaders/GLTFLoader.js");
            final = final.replaceAll("/ionicons.esm.js", "https://christianengineeringsolutions.com/ionicons.esm.js");
            final = final.replaceAll("/ionicons.js", "https://christianengineeringsolutions.com/ionicons.js");
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
    //REX
    if(req.session.CESCONNECT){
        getRemotePage(req, res);
    }
    else{
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
            versionOf: null
        }).populate('author users sourceList parent collaborators versions mirror').sort({stars:-1, _id:-1}).limit(DOCS_PER_PAGE);
        // for(const passage of passages){
        //     // return await getPassage(passage._id);
        //     // passages[passage] = bubbleUpAll(passage);
        //     // passage.location = await returnPassageLocation(passage);
        //     // passage.sourceList = await getRecursiveSourceList(passage.sourceList);
        // }
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
        passages = await fillUsedInList(passages);
        res.render("stream", {
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passages: passages, 
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            bookmarks: bookmarks,
            ISMOBILE: ISMOBILE,
            page: 'posts',
            whichPage: 'stream'
        });
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
    if(passage.mirrorEntire && passage.mirror != null){
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
    passage.location = await returnPassageLocation(passage);
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
        var subPassages = await Passage.paginate({parent: passage_id, comment:false}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList collaborators versions mirror bestOf best'});
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
            var subPassages = await Passage.find({parent: passage_id, comment: false}).populate('author users sourceList collaborators versions mirror bestOf best');  
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
        var comments = await Passage.paginate({comment:true, parent:passage._id}, {sort: {stars: -1, _id: -1}, page: page, limit: DOCS_PER_PAGE, populate: 'author users sourceList'});
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
async function logVisit(req){
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
    const newVisitor = new Visitor({ ipAddress: ipAddress, user: req.session.user || null, visited: passage._id });
    await newVisitor.save();
    }
}
app.get('/thread', async (req, res) => {
    // ALT
    var bigRes = await getBigPassage(req, res);
    await logVisit(req);
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
async function getRecursiveSourceList(sourceList, sources=[], passage){
    for(const source of sourceList){
        var sourcePassage = await Passage.findOne({_id:source});
        //get specials as well
        // sourcePassage = await getPassage(sourcePassage);
        if(sourcePassage != null){
            var special = null;
            console.log(sourcePassage._id);
            if(sources.includes(sourcePassage)){
                console.log('flaiys');
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
                special = await Passage.findOne({_id:special});
                sources.push(special);
            }
            sources = await getRecursiveSourceList(sourcePassage.sourceList, sources, passage);
        }
    }
    console.log(sources);
    sources = sources.filter(i => i);
    sources = Object.values(sources.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
    return sources;
}

app.get('/feed', async (req, res) => {
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    //REX
    if(req.session.CESCONNECT){
        getRemotePage(req, res);
    }
    else{
        let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
        let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
        let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
        let golden = '';
        let addPassageAllowed = true;
        let addChapterAllowed = true;
        var user = req.session.user || null;
        const followings = await Follower.find({ user: req.session.user._id.toString() });
        const followingIds = followings.map(f => f.following._id);
        let passages = await Passage.find({
            deleted: false,
            personal: false,
            author: { $in: followingIds },
        }).populate('author users sourceList parent').sort({stars:-1, _id:-1}).limit(DOCS_PER_PAGE);
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
        passages = await fillUsedInList(passages);
        res.render("stream", {
            subPassages: false,
            passageTitle: false, 
            scripts: scripts, 
            passages: passages, 
            passage: {id:'root', author: {
                _id: 'root',
                username: 'Sasame'
            }},
            bookmarks: bookmarks,
            ISMOBILE: ISMOBILE,
            page: 'feed',
            whichPage: 'feed',
            thread: false
        });
    }
});
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
    var stars = await totalStars();
    res.render('donate', {
        passage: {id: 'root'}, usd: ((await scripts.getMaxToGiveOut())/100), stars: stars,
        totalUSD: usd/100,
        donateLink: process.env.STRIPE_DONATE_LINK,
        subscribeLink: process.env.STRIPE_SUBSCRIBE_LINK
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
    // let exact = await Passage.findOne({personal:false,deleted:false,title:search});
    // if(exact == null && req.session.user){
    //     let passage = await Passage.create({
    //         author: req.session.user._id,
    //         users: [req.session.user._id],
    //         parent: null,
    //         title: search,
    //         public: true
    //     });
    // }
    var label = req.body.label;
    var find = {
        deleted: false,
        versionOf: null,
        personal: req.body.personal,
        title: {$regex:search,$options:'i'},
        // $or: [
        //     {title: {$regex:search,$options:'i'}},
        //     {content: {$regex:search,$options:'i'}},
        //     {code: {$regex:search,$options:'i'}},
        // ],
    };
    if(label != 'All'){
        find.label = req.body.label;
    }
    // var find1 = find;
    // find1.title = search;
    // var find2 = find;
    // find2.title = {};

    if(req.body.personal == 'true'){
        find.users = {
            $in: [req.session.user._id]
        }
    }
    switch(req.body.whichPage){
        case 'tasks':
            find.public = true;
            find.forum = false;
            break;
        case 'projects':
            find.public = false;
            find.forum = false;
            break;
        case 'feed':
            const followings = await Follower.find({ user: req.session.user._id.toString() });
            const followingIds = followings.map(f => f.following._id);
            find.author = {
                $in: followingIds
            };
            break;
    }
    console.log(req.body.whichPage);
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
    let results = await Passage.find(find).populate('author users sourceList parent').sort(sort).limit(DOCS_PER_PAGE);
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
        //add passage to sourcelist
        parent = await Passage.findOne({_id: req.body.parent});
        parent.sourceList.push(passage._id);
        //remove duplicates
        parent.sourceList = Object.values(parent.sourceList.reduce((acc,cur)=>Object.assign(acc,{[cur._id.toString()]:cur}),{}));
        parent.markModified('sourceList');
        await parent.save();
        console.log('souces:'+parent.sourceList);
        var test = await Passage.findOne({_id:parent._id});
        console.log('sources'+test.sourceList);
        var title = passage.title == '' ? 'Untitled' : passage.title;
        return res.send('<div data-token="'+passage._id+'"data-title="'+title+'"class="new-source">"'+title+'" Added to Sourcelist.</div>');
    }
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
                    bookmark.passage.title = mirror.title;
                }
            }
            if(bookmark.passage.bestOf != null){
                if(bookmark.passage.bestOfEntire){
                    var mirror = await Passage.findOne({parent:bookmark.passage.bestOf._id}).sort('-stars');
                    bookmark.passage.title = mirror.title;
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
    console.log("HEEEELLLLLOOOO");
    var passage = await Passage.findOne({_id: req.body.passageID});
    if(req.session.user && req.session.user._id.toString() == passage.author._id.toString()){
        var collaborator = await User.findOne({username:req.body.username});
        console.log("HALT");
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
app.post('/stripe_webhook', bodyParser.raw({type: 'application/json'}), async (request, response) => {
    // response.header("Access-Control-Allow-Origin", "*");
    // response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET_KEY;
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
    //if subscription created or ended
    //update subscription data in db
    //...
    // Handle the checkout.session.completed event
    // For Custom Amount Investment
    if (event.type === 'checkout.session.completed') {
        let amount = payload.data.object.amount_total;
        //Save recording passage in database and give user correct number of stars
        //get user from email
        var user = await User.findOne({email: payload.data.object.customer_details.email});
        if(user){
            var totalAmount = await totalUSD();
            var amountToAdd = 0;
            amountToAdd = (await percentUSD(parseInt(amount))) * (await totalStars());
            user.stars += amountToAdd;
            await user.save();
        }
    }
    //For Subscriptions
    else if(event.type == "invoice.paid"){
        console.log(JSON.stringify(payload.data.object.subscription));
        var email = payload.data.object.customer_email;
        if(email != null){
            //they get stars
            //plus time bonus
            var subscriber = await User.findOne({email: email});
            subscriber.subscriptionID = payload.data.object.subscription;
            subscriber.subscribed = true;
            subscriber.lastSubscribed = new Date();
            let monthsSubscribed = monthDiff(subscriber.lastSubscribed, new Date());
            subscriber.stars += (await percentUSD(80 * 100 * monthsSubscribed)) * (await totalStars());
            await subscriber.save();
        }
    }
    else if(event.type == "invoice.payment_failed"){
        var email = payload.data.object.customer_email;
        if(email != null){
            var subscriber = await User.findOne({email: email});
            subscriber.subscribed = false;  
            await subscriber.save();
        }
    }
    else{
        console.log(event.type);
    }  
    response.status(200).end();
  });
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
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const endpointSecret = process.env.STRIPE_ENDPOINT_CONNECT_SECRET_KEY;
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
            user.canReceivePayouts = canReceivePayouts(updatedAccount);
            await user.save();
          break;
        // ... handle other event types
        default:
          console.log(`Unhandled event type ${event.type}`);
    }
    response.status(200).end();
  });
  function getStarsFromUSD(usd){
    return percentUSD(usd) * totalStars();
  }
app.post('/unsubscribe', async function(req, res){
    if(req.session.user){
        console.log("here");
        var user = await User.findOne({_id: req.session.user._id});
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const deleted = await stripe.subscriptions.del(
            user.subscriptionID
        );
        user.subscribed = false;
        user.subscriptionID = null;
        await user.save();
        req.session.user = user;
    }
    res.send("Done.");
});
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
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
        sendEmail(req.body.email, 'Recover Password: Infinity-Forum.org', 
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
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    try {
        let user = await User.findOne({_id: req.session.user._id});
      // Retrieve the user's Stripe account and check if they have finished onboarding
      const account = await stripe.account.retrieve(user.stripeAccountId);
      if (account.details_submitted) {
        user.stripeOnboardingComplete = true;
        user.canReceivePayouts = canReceivePayouts(account);
        await user.save();
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
    if(user){
        req.session.user = user;
        return res.redirect('/profile/'+ user.username + '/' + user._id);
    }
    else{
        return res.redirect('/loginform');
    }
});
app.get('/dbbackup.zip', async (req, res) => {
    if(!req.session.user || !req.session.user.admin){
        return res.redirect('/');
    }
    exec("mongodump", async function(){
        var directory1 = __dirname + '/dump';
        var AdmZip = require("adm-zip");
        const fsp = require('fs').promises;
        var zip1 = new AdmZip();
        var zip2 = new AdmZip();
        //compress /dump and /dist/uploads then send
        const files = await readdir(directory1);
        for(const file of files){
            console.log(file);
            zip1.addLocalFolder(__dirname + '/dump/' + file);
        }
        return res.send(zip1.toBuffer());
    });
});
app.get('/uploadsbackup.zip', async (req, res) => {
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
app.get('/protectedbackup.zip', async (req, res) => {
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
app.post('/restoredatabase', async (req, res) => {
    var AdmZip = require("adm-zip");
    const fsp = require('fs').promises;
    var files = req.files;
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    var fileToUpload = req.files.file;
    fileToUpload.mv('./tmp/db.zip', async function(err) {
        var zip1 = new AdmZip(__dirname + '/tmp/db.zip');
        zip1.extractAllTo(__dirname + '/dump/sasame/');
        await fsp.rename(__dirname + "/dump/sasame/system.version.bson", __dirname + "/dump/admin/system.version.bson");
        await fsp.rename(__dirname + "/dump/sasame/system.version.metadata.json", __dirname + "/dump/admin/system.version.metadata.json");
        await fsp.unlink(__dirname + "/tmp/db.zip");
        exec("mongorestore", async function(){
           return res.send("Database restored."); 
        });
    });
});
app.post('/restoreuploads', async (req, res) => {
    var AdmZip = require("adm-zip");
    const fsp = require('fs').promises;
    var files = req.files;
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    var fileToUpload = req.files.file;
    fileToUpload.mv('./tmp/uploads.zip', async function(err) {
        var zip1 = new AdmZip(__dirname + '/tmp/uploads.zip');
        zip1.extractAllTo(__dirname + '/dist/uploads/');
        await fsp.unlink(__dirname + "/tmp/uploads.zip");
        return res.send("Uploads restored.");
    });
});
app.post('/restoreprotected', async (req, res) => {
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
//test
app.get('/admin', async function(req, res){
    // await mongoSnap('./backup/collections.tar'); // backup
    // await mongoSnap('./backups/collections.tar', true); // restore
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    if(!req.session.user || !req.session.user.admin){
        return res.redirect('/');
    }
    else{
        //view all passages requesting to be a public daemon
        var passages = await Passage.find({public_daemon:1}).sort('-stars');
        let bookmarks = [];
        // if(req.session.user){
        //     bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
        // }
        if(req.session.user){
            bookmarks = getBookmarks(req.session.user);
        }
        passages = await fillUsedInList(passages);
        return res.render("admin", {
            subPassages: false,
            ISMOBILE: ISMOBILE,
            test: 'test',
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

        const name = req.body.name;
        const response_key = req.body["g-recaptcha-response"];
        const secret_key = "6Ldgf0gpAAAAALUayL5did3npJvmacmngo1bNeTU";
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

        let numUsers = await User.countDocuments({username: req.body.username.trim()}) + 1;
        
        var userData = {
        name: req.body.username || req.body.email,
        username: req.body.username.split(' ').join('.') + '.' + numUsers || '',
        password: req.body.password,
        stars: 0,
        token: v4()
        }  //use schema.create to insert data into the db
      if(req.body.email != ''){
        userData.email = req.body.email;
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
          if(user.email && user.email.length > 1){
            sendEmail(user.email, 'Verify Email for Infinity Forum.', 
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

        if(user){
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
app.post('/paginate', async function(req, res) {
    try {
        const { page, profile, search = '', parent = 'root', whichPage, sort = 'Most Stars', label = 'All', from_ppe_queue } = req.body;
        
        console.log(`Processing page ${page} with profile ${profile}`);

        // Handle standard passages
        if (!['filestream', 'messages', 'leaderboard'].includes(profile)) {
            let find = {
                personal: false,
                versionOf: null,
                title: new RegExp(search, "i"),
            };

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
                    const followings = await Follower.find({ user: req.session.user._id.toString() });
                    find.author = { $in: followings.map(f => f.following._id) };
                    break;
            }
            if (parent !== 'root') find.parent = parent;
            if (profile !== 'false') find.author = profile;
            if (from_ppe_queue) find.mimeType = 'image';
            if (label !== 'All') find.label = label;

            var sort_query = {stars: -1, _id: -1};
            switch(sort) {
                case 'Most Stars':
                    sort_query = {stars: -1, _id: -1};
                    break;
                case 'Newest-Oldest':
                    sort_query = {date: -1};
                    break;
                case 'Oldest-Newest':
                    sort_query = {date: 1};
                    break;
            }

            let passages;
            try {
                passages = await Passage.paginate(find, {
                    sort: sort_query, 
                    page: page, 
                    limit: DOCS_PER_PAGE, 
                    populate: 'author users parent sourceList'
                });
                
                console.log(`Found ${passages.docs.length} passages for page ${page}`);
            } catch (err) {
                console.error('Error in pagination:', err);
                throw err;
            }

            // Process passages with error handling for each
            const processedPassages = [];
            for (let i = 0; i < passages.docs.length; i++) {
                try {
                    console.log(`Processing passage ${i + 1}/${passages.docs.length}, ID: ${passages.docs[i]._id}`);
                    
                    // Debug log the passage structure
                    console.log('Passage structure:', {
                        id: passages.docs[i]._id,
                        hasUsers: Array.isArray(passages.docs[i].users),
                        hasAuthor: !!passages.docs[i].author,
                        hasParent: !!passages.docs[i].parent,
                        hasSourceList: Array.isArray(passages.docs[i].sourceList),
                    });

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
            var passages = [];
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
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
            var where = passage.personal ? 'protected': 'uploads';
            fs.unlink('dist/'+where+'/'+filename, function(err){
                if (err && err.code == 'ENOENT') {
                    // file doens't exist
                    console.info("File doesn't exist, won't remove it.");
                } else if (err) {
                    // other errors, e.g. maybe we don't have enough permission
                    console.error("Error occurred while trying to remove file");
                } else {
                    console.info(`removed upload for deleted passage`);
                }
            });
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
async function createPassage(user, parentPassageId, subforums=false, comments=false){
    let users = null;
    let parentId = null;
    var isRoot = parentPassageId == 'root';
    var parent;
    var personal = false;
    var fileStreamPath = null;
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
        personal: personal
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
            parent.passages.push(passage);
            parent.markModified('passages');
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
app.post('/create_initial_passage/', async (req, res) => {
    if(!req.session.user){
        return res.send("You must log in to create a passage.");
    }
    let user = req.session.user || null;
    var chief = req.body.chief;
    if(req.body['post-top'] && req.body['post-top'] == 'on'){
        chief = 'root';
    }
    //create passage
    var newPassage = await createPassage(user, chief.toString(), req.body.subforums, req.body.comments);
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
    if(parent != null){
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
    console.log('star_passage');
    var passage_id = req.body.passage_id;
    var user = req.session.user;
    var amount = parseInt(req.body.amount);
    //get user from db
    let sessionUser = await User.findOne({_id: user._id});
    var subPassage = req.body.parent == 'root' ? false : true;
    if(req.session && user){
        if(sessionUser.stars > amount && process.env.REMOTE == 'true'){
            //user must trade their own stars
            sessionUser.stars -= parseInt(amount);
            let passage = await starPassage(req, amount, req.body.passage_id, sessionUser._id, false);
            await sessionUser.save();
            passage = await getPassage(passage);
            passage.location = await returnPassageLocation(passage);
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else if(process.env.REMOTE == 'false'){
            let passage = await starPassage(req, amount, req.body.passage_id, sessionUser._id, false);
            await sessionUser.save();
            passage = await getPassage(passage);
            passage.location = await returnPassageLocation(passage);
            return res.render('passage', {subPassage: subPassage, subPassages: false, passage: passage, sub: true});
        }
        else{
            return res.send("Not enough stars!");
        }
    }
});
async function singleStarSources(user, sources, reverse=false){
    for(const source of sources){
        //check if starred already
        var recordSingle = await Star.findOne({user: user._id, passage:source, single:true, system:false});
        var recordSingleSystem = await Star.findOne({user: user._id, passage:source, single:true, system:true});
        //unstar if no previous record of being directly starred
        if(reverse && recordSingle == null){
            await Star.deleteOne({user: user, passage: source._id, single: true});
            source.stars -= 1;
            source.starrers = source.starrers.filter(u => {
                return u != user;
            });
        }
        //star if hasnt been starred already
        else if(recordSingleSystem == null && recordSingle == null){
            source.stars += 1;
            source.starrers.push(user);
            var sources = await getRecursiveSourceList(source.sourceList, [], source);
            var star = await Star.create({
                user: user,
                passage: source,
                amount: 1,
                sources: sources,
                single: true,
                system: true
            });
        }
        await source.save();
    }
}
async function singleStarPassage(req, passage, reverse=false, isSub=false){
    var user = req.session.user._id.toString();
    var sources = await getRecursiveSourceList(passage.sourceList, [], passage);
    //check if starred already
    var recordSingle = await Star.findOne({user: user._id, passage:passage, single:true, system:false});
    var recordSingleSystem = await Star.findOne({user: user._id, passage:passage, single:true, system:true});
    if(!reverse){
        //star mirror best and bestof and repost
        //and add to sources
        if(passage.showBestOf){
            var best = await Passage.findOne({parent: passage._id}, null, {sort: {stars: -1}});
            if(best != null){
                sources.push(best);
            }
        }
        else{
            try{
                var mirror = await Passage.findOne({_id:passage.mirror._id}).populate('parent author users sourceList collaborators versions subforums');
                if(mirror != null)
                sources.push(mirror);
            }
            catch(e){
            }
            try{
                var bestOf = await Passage.findOne({parent:passage.bestOf._id}).sort('-stars').populate('parent author users sourceList collaborators versions subforums');
                if(bestOf != null)
                    sources.push(bestOf);
            }
            catch(e){
            }
        }
        //star if hasn't been starred already
        if((recordSingleSystem == null && recordSingle == null) || !isSub){
            var system = isSub ? true : false;
            //star each source recursively
            var star = await Star.create({
                user: req.session.user._id,
                passage: passage._id,
                amount: 1,
                sources: sources,
                single: true,
                system: system
            });
            await singleStarSources(user, sources);
            passage.stars += 1;
            passage.starrers.push(user);
        }
        //if bubbling star all sub passages (content is displayed in parent)
        if(passage.bubbling && passage.passages && !passage.public){
            for(const p of passage.passages){
                //also star sources for each sub passage
                passage.sourceList = [...passage.sourceList, ...p.sourceList];
                await singleStarPassage(req, p, false, true);
            }
        }
    }
    else{
        if(passage.starrers.includes(user)){
            //unstar if no previous record of being directly starred
            if(recordSingle == null){
                var record = await Star.findOne({user:req.session.user._id, passage: passage._id});
                await singleStarSources(user, sources, true);
                passage.stars -= 1;
                passage.starrers = passage.starrers.filter(u => {
                    return u != user;
                });
                await Star.deleteOne({user: user, passage: passage._id, single: true});
            }

            //if bubbling unstar all sub passages (content is displayed in parent)
            if(passage.bubbling && passage.passages && !passage.public){
                for(const p of passage.passages){
                    //also star sources for each sub passage
                    passage.sourceList = [...passage.sourceList, ...p.sourceList];
                    await singleStarPassage(req, p, true, true);
                }
            }
        }
    }
    passage.markModified("starrers");
    await passage.save();
    passage = await getPassage(passage);
    return passage;
}
app.post('/single_star/', async (req, res) => {
    var user = req.session.user._id.toString();
    if(req.session && req.session.user){
        var p = await Passage.findOne({_id: req.body._id});
        console.log("ON:"+req.body.on);
        console.log(p.starrers.includes(user));
        if(req.body.on == 'false' && !p.starrers.includes(user)){
            console.log("NOO");
            var passage = await singleStarPassage(req, p);
        }
        else if(req.body.on == 'true'){
            console.log("YES");
            var passage = await singleStarPassage(req, p, true);
        }
        else{
            console.log("WHAT");
        }
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
    if(passage.author._id.toString() != req.session.user._id.toString()){
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
    passage.updated = Date.now();
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
        user.thumbnail = '';
        await user.save();
    }else{
        // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
        var fileToUpload = req.files.photo;
        //uuid with  ext
        var uploadTitle = v4() + "." + fileToUpload.name.split('.').at(-1);
        var where = 'uploads';
        // Use the mv() method to place the file somewhere on your server
        fileToUpload.mv('./dist/'+where+'/'+uploadTitle, function(err) {
            if (err){
                return res.status(500).send(err);
            }
        });
        user.thumbnail = uploadTitle;
        await user.save();
    }
}
async function deleteOldUploads(passage){
    const Passage = require('./models/Passage');
    var where = passage.personal ? 'protected' : 'uploads';
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
                    await fsp.unlink(path);
                    console.info(`removed old upload`);
                    var filteredArray = passage.filename.filter(e => e !== f)
                    passage.filename = filteredArray;
                }
            }
            catch(e){
                console.log(passage.filename);
                console.log(passage.filename.length);
                console.log("No file to unlink.");
                passage.filename = [];
            }
        }
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
                            exec('python3 compress.py ' + partialpath + '/' + uploadTitle + ' ' + 
                                 mimeType.split('/')[1] + ' ' + passage._id,
                                (err, stdout, stderr) => {
                                    console.log(err + stdout + stderr);
                                    console.log("=Ok actually finished compressing img");
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
    await Passage.updateMany({mainFile:true}, {mainFile:false});
    //await Passage.deleteMany({fileStreamPath: {$ne:null}});
    var author = await User.findOne({admin:true});
    let top = await Passage.create({
        title: 'Infinity Forum Source Code',
        author: author._id,
        fileStreamPath: __dirname + '/',
        mainFile: true,
        public: false,
        parent: null,
    });
    //create filestream
    await loadFileStream(top);
}
//create FileStream passage if not exists
async function loadFileStream(top, directory=__dirname){
    const fsp = require('fs').promises;
    var author = await User.findOne({admin:true});
    try {
        const files = await readdir(directory);
        console.log(directory);
        let parentDirectory = await Passage.findOne({
            mainFile: true,
            fileStreamPath: directory
        });
        for (const file of files){
            if(file == '.env' || file == '.git' || file == 'node_modules' || file == 'images'){
                continue;
            }
            // console.log(directory + '/' + file);
            //create passage for file or directory
            var stats = await fsp.stat(directory + '/' + file);
            var title = file;
            if(await stats.isDirectory()){
                //create directory passage
                var exists = await Passage.findOne({
                    mainFile: true,
                    fileStreamPath: directory + '/' + file,
                    title: title + '/'
                });
                if(exists == null){
                    let passage = await Passage.create({
                        title: title + '/',
                        author: author._id,
                        fileStreamPath: directory + '/' + file,
                        mainFile: true,
                        public: false,
                        parent: directory == __dirname ? top._id : parentDirectory._id,
                    });
                }
                //recursively create passages
                //put in parent directory
                await loadFileStream(top, directory + '/' + file);
            }
            else{
                //create passage
                var exists = await Passage.findOne({
                    mainFile: true,
                    fileStreamPath: directory + '/' + file,
                    title: file
                });
                if(exists == null){
                    let passage = await Passage.create({
                        title: title,
                        author: author._id,
                        code: await fsp.readFile(directory + '/' + file),
                        lang: getLang('.' + file.split('.').at('-1')),
                        fileStreamPath: directory + '/' + file,
                        mainFile: true,
                        parent: directory == __dirname ? top._id : parentDirectory._id,
                        public: false
                    });
                    if(parentDirectory != null){
                        parentDirectory.passages.push(passage);
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
    await syncFileStream();
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
                var bash = 'sh ' + __dirname + 'restart.sh';
            shell.exec(bash, function(code, output) {
            console.log('Exit code:', code);
            console.log('Program output:', output);
            });
        //restart.sh (Server file)
        //echo "password" | sudo pm2 restart sasame
        // echo "password" | sudo systemctl restart nginx

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
        return res.redirect('/');
    }
}
function sendEmail(to, subject, body){
    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
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
    });
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
setInterval(() => {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = currentMemory - initialMemory;

    if (memoryIncrease > MAX_MEMORY_INCREASE) {
        console.error(`Memory leak alert! Memory increased by ${memoryIncrease / 1024 / 1024}MB`);
        // Send alert (email, Slack, etc.)
        console.log('Memory Leak Warning', `Memory increased by ${memoryIncrease / 1024 / 1024}MB`);
    }
}, 1 * 60 * 1000);
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
process.on('SIGTERM', function(err){
    console.log('SIGTERM');
    console.log(err);
    server.close();
});
// Proper cleanup on application shutdown
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error during MongoDB shutdown:', err);
        process.exit(1);
    }
});

//debugging
/**
 * 
(async function(){
    var passage = await GETPASSAGE('63faabffa5dc86b7e4d28180');
    document.write(passage);
})();

*/
