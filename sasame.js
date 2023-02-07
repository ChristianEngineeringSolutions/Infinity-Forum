'use strict';
const express = require('express');
const fileUpload = require('express-fileupload');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const bodyParser = require("body-parser");
const helmet = require('helmet');
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();
const PORT = process.env.PORT || 3000;
var http = require('http').Server(app);
var io = require('socket.io')(http);
// Models
const User = require('./models/User');
const Passage = require('./models/Passage');
// Controllers
const passageController = require('./controllers/passageController');
// Routes
const passageRoutes = require('./routes/passage');

var fs = require('fs'); 
var path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { v4 } = require('uuid');

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
});

var app = express();
app.use(cors());
app.use(helmet());
app.use(fileUpload());
// make sure recordings folder exists
const recordingFolder = './dist/recordings/';
if (!fs.existsSync(recordingFolder)) {
  fs.mkdirSync(recordingFolder);
}


// Setup Frontend Templating Engine - ejs
const ejs = require('ejs');
app.use(express.static('./dist'));
app.set('view engine', 'ejs');
app.set('views', './views');

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

// User Session Setup Logic
const session = require('express-session');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
var MongoStore  = require('connect-mongo');
const scripts = {};
scripts.isPassageUser = function(user, passage){
    var ret;
    if(user._id.toString() == passage.author._id.toString()){
        return true;
    }
    passage.users.forEach(function(u){
        if(u._id.toString() == user._id.toString()){
            return true;
        }
    });
    return false;
};
app.use(cookieParser());
app.use(session({
    secret: "ls",
    resave: true,
    saveUninitialized: true,
    // store: new MongoStore({
    //     db: 'sasame',
    //     host: '127.0.0.1',
    //     port: 3000
    // })
}));
app.use(function(req, res, next) {
  res.locals.user = req.session.user;
  next();
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

//CRON
var cron = require('node-cron');
//run monthly cron
cron.schedule('0 12 1 * *', async () => {
    //Give stars to subscribed users
    // var subscribers = await User.find({subscribed: true});
    // var systemRecord = await GetMainSystemRecord();
    // var systemContent = JSON.parse(systemRecord.content);
    // var addStars = 0;
    // //if user is still subscribed
    // //they get stars
    // //plus time bonus
    // subscribers.forEach(async function(subscriber){
    //     let monthsSubscribed = monthDiff(Date.parse(subscriber.lastSubscribed), Date.now());
    //     addStars = percentUSD(8000, systemContent.usd);
    //     systemContent.usd += 8000;
    //     systemContent.stars += addStars * monthsSubscribed;
    //     subscriber.stars += addStars * monthsSubscribed;
    // });
    //await rewardUsers();
    console.log('Monthly Cron ran at 12pm.');
});

// function monthDiff(d1, d2) {
//     var months;
//     months = (d2.getFullYear() - d1.getFullYear()) * 12;
//     months -= d1.getMonth();
//     months += d2.getMonth();
//     return months <= 0 ? 0 : months;
// }
//Get total star count and pay out users
async function rewardUsers(){
    let users = await User.find({stripeAccountId: {$ne: null}});
    let MainSystemRecord = await GetMainSystemRecord();
    let systemContent = JSON.parse(MainSystemRecord.content);
    let totalStarCount = systemContent.stars;
    let totalUSD = systemContent.usd;
    users.forEach(async function(user){
        //appropriate percentage based on stars
        //users get same allotment as they have percentage of stars
        let userUSD = percentStars(user.stars, totalStarCount) * totalUSD;
        const transfer = await stripe.transfers.create({
            amount: userUSD,
            currency: "usd",
            destination: user.stripeAccountId,
        });
    });
}
async function starUser(numStars, userId){
    let user = await User.findOne({_id: userId});
    user.stars += numStars;
    await user.save();
    let SystemRecord = await GetMainSystemRecord();
    let preContent = JSON.parse(SystemRecord.content);
    preContent.stars = parseInt(preContent.stars) + numStars;
    SystemRecord.content = JSON.stringify(preContent);
    await SystemRecord.save();
}
/**
 * db.Passages.insertOne({
 *  MainSystemRecord: true,
 *  content: '{"stars": 0, "usd": 0}'
 * });
 */
async function GetMainSystemRecord(){
    let passage = await Passage.findOne({MainSystemRecord: true});
    return passage;
}
function percentStars(user_stars, totalStarCount){
    return users_stars / totalStarCount;
}
function percentUSD(donationUSD, totalUSD){
    return donationUSD / totalUSD;
}

async function starPassage(amount, passageID, userID){
    let user = await User.findOne({_id: userID});
    let passage = await Passage.findOne({_id: passageID});
    let numSources = passage.sourceList.length;
    amount = amount * (numSources + 1);
    //give bonuses according to previous systemrecords for this passage
    let systemRecords = await Passage.find({
        parent: passageID,
        systemRecord: true,
        title: 'Star'
    });
    //Give bonus to all previous starrers
    systemRecords.forEach(async function(record){
        let numStars = record.stars;
        if(record.stars > amount){
            numStars = (amount / record.stars) * record.stars;
        }
        else if (amount > record.stars){
            numStars = (record.stars / amount) * amount;
        }
        await starUser(numStars, record.users[0]);
        //The passage gets the bonus too
        amount += numStars;
    });
    //add stars to passage, sourceList, and sub Passages
    passage.stars += amount;
    await passage.save();
    //star each source
    passage.sourceList.forEach(async function(source){
        await starPassage(amount, source._id, userID);
    });
    //star all sub passages
    (async function lambda(passage){
        passage.passages.forEach(async function(p){
            await starPassage(amount, p._id, userID);
            await lambda(p);
        });
    })(passage);
    //then add stars to users appropriately (will be reflected in the main system record)
    //if starring user is passage creator,
    //they can get bonuses and star the passage,
    //but they won't get initial stars; it is an investment
    if(userID != passage.users[0]._id){
        await starUser(amount, passage.users[0]);
    }
    //add systemrecord passage
    let systemRecord = await Passage.create({
        author: userID,
        systemRecord: true,
        parent: passageID,
        stars: amount,
        users: [userID],
        title: 'Star'
    });
    return passage;
}
async function notifyUser(userId, content, type="General"){
    let notification = await Notification.create({
        user: userId,
        content: content,
        type: type
    });
}
//ROUTES
//GET (or show view)
app.get("/api", async (req, res) => {
    //allow cross origin
});

app.get("/profile/:_id?/", async (req, res) => {
    let bookmarks = [];
    let profile;
    if(typeof req.params._id == 'undefined'){
        if(!req.session.user){
            res.redirect('/');
        }
        profile = req.session.user;
    }
    else{
        profile = await User.findOne({_id: req.params._id});
    }
    let find = {users: profile, systemRecord: false, deleted: false};
    //if it's their profile show personal passages
    // if(req.session.user && profile._id.toString() == req.session.user._id.toString()){
    //     find.$or = [{personal: true}, {personal: false}];
    // }
    let passages = await Passage.find(find).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    if(req.session.user){
        bookmarks = await User.find({_id: req.session.user._id}).populate('passages').passages;
    }
    // console.log(profile[0].username);
    res.render("profile", {subPassages: false, passages: passages, scripts: scripts, profile: profile, bookmarks: bookmarks});
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
app.get('/', async (req, res) => {
    //scripts.renderBookPage(req, res);
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
    let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
    let golden = '';
    let addPassageAllowed = true;
    let addChapterAllowed = true;
    var user = req.session.user || null;
    let passages = await Passage.find({
        deleted: false,
        systemRecord: false,
        MainSystemRecord: false
    }).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    let passageUsers = [];
    let bookmarks = [];
    if(req.session.user){
        bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
    }
    res.render("index", {
        subPassages: false,
        passageTitle: 'Christian Engineering Solutions', 
        scripts: scripts, 
        passages: passages, 
        passage: {id:'root', author: {
            _id: 'root',
            username: 'Sasame'
        }},
        bookmarks: bookmarks,
    });
});
app.get('/donate', async function(req, res){
    let MainSystemRecord = await GetMainSystemRecord();
    let systemContent = JSON.parse(MainSystemRecord.content);
    res.render('donate', {passage: {id: 'root'}, usd: systemContent.usd, stars: systemContent.stars});
});
//Search
app.post('/search_leaderboard/', async (req, res) => {
    let results = await User.find({
        username: {
        $regex: req.body.search,
        $options: 'i',
    }}).sort('-stars').limit(20);
    res.render("leaders", {
        users: results,
    });
});
app.post('/search_profile/', async (req, res) => {
    let results = await Passage.find({
        author: req.body._id,
        deleted: false,
        systemRecord: false,
        MainSystemRecord: false,
        title: {
        $regex: req.body.search,
        $options: 'i',
    }}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true
    });
});
app.post('/ppe_search/', async (req, res) => {
    let parent = req.body.parent == 'root' ? null : req.body.parent;
    let results = await Passage.find({
        parent: parent,
        deleted: false,
        systemRecord: false,
        MainSystemRecord: false,
        mimeType: 'image',
        title: {
        $regex: req.body.search,
        $options: 'i',
    }}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    res.render("ppe_thumbnails", {
        thumbnails: results,
    });
});
app.post('/search_passage/', async (req, res) => {
    let results = await Passage.find({
        parent: req.body._id,
        deleted: false,
        systemRecord: false,
        MainSystemRecord: false,
        title: {
        $regex: req.body.search,
        $options: 'i',
    }}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true
    });
});
app.post('/search/', async (req, res) => {
    let results = await Passage.find({
        deleted: false,
        systemRecord: false,
        MainSystemRecord: false,
        title: {
        $regex: req.body.search,
        $options: 'i',
    }}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    res.render("passages", {
        passages: results,
        subPassages: false,
        sub: true
    });
});
app.post('/bookmark_passage', async (req, res) => {
    let user = await User.findOne({_id: req.session.user._id});
    user.bookmarks.push(req.body._id);
    await user.save();
    res.send('done.');
});
// Add security if reactivating check if passage user first
// app.post('/copy_passage/', async (req, res) => {
//     let copy = await passageController.copyPassage(req, res, function(){
        
//     });
//     let passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList');
//     res.render('passage', {subPassages: false, passage: copy, sub: true});
// });
app.post('/transfer_bookmark', async (req, res) => {
    let _id = req.body._id;
    let parent = req.body.parent;
    //first check if parent allow submissions (is Public)
    if(parent !== 'root'){
        let parentPassage = await Passage.findOne({_id: parent});
        if(parentPassage.public === false && parentPassage.author.toString() != req.session.user._id.toString() && !scripts.isPassageUser(req.session.user, parentPassage)){
            return res.send("<h2 style='text-align:center;color:red;'>Passage is private. Ask to be on the Userlist, or consider Bookmarking it, and copying it over to your own passage.</h2>");
        }
    }
    //First copy the passage
    let copy = await passageController.copyPassage(req, res, function(){
        
    });
    //Then move the copy into the current tab
    if(parent !== 'root'){
        let tab = await Passage.findOne({_id: parent}).populate('author users sourceList');
        tab.passages.push(copy._id);
        copy.parent = tab._id;
        await tab.save();
        await copy.save();
    }
    res.render('passage', {subPassages: false, passage: copy, sub: true});
});
app.get('/get_bookmarks', async (req, res) => {
    let bookmarks = [];
    if(req.session.user){
        let user = await User.findOne({_id: req.session.user._id}).populate('bookmarks');
        bookmarks = user.bookmarks;
    }
    res.render('bookmarks', {bookmarks: bookmarks});
});
app.get('/get_daemons', async (req, res) => {
    let daemons = [];
    if(req.session.user){
        let user = await User.findOne({_id: req.session.user._id}).populate('daemons');
        daemons = user.daemons;
    }
    res.render('daemons', {daemons: daemons});
});
app.post('/add_daemon', async (req, res) => {
    if(req.session.user){
        let passage = req.body._id;
        let daemon = await Passage.findOne({_id: passage});
        let user = await User.findOne({_id: req.session.user._id});
        user.daemons.push(daemon);
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
        user.daemons.forEach(function(d, i){
            if(d._id.toString() == daemon._id.toString()){
                user.daemons.splice(i, 1);
            }
        });
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
    let users = await User.find().sort('-stars');
    res.render('leaderboard', {passage: {id: 'root'},users: users, scripts: scripts});
});
app.post('/add_user', async (req, res) => {
    let passageId = req.body.passageId;
    let username = req.body.username;
    let user = await User.findOne({username: username});
    let passage = await Passage.findOne({_id: passageId});
    if(user && req.session.user && req.session.user._id == passage.users[0]._id){
        passage.users.push(user._id);
        await passage.save();
        res.send("User Added");
    }
    else{
        res.send("User not found.");
    }
});
app.post('/passage_setting', async (req, res) => {
    let _id = req.body._id;
    let setting = req.body.setting;
    let user = await User.findOne({_id: req.session.user._id});
    let passage = await Passage.findOne({_id: _id}).populate('author');
    console.log(user._id);
    console.log(passage.author);
    switch(setting){
        case 'private':
            if(passage.author._id.toString() == user._id.toString()){
                console.log(1);
                passage.public = false;
            }
            break;
        case 'public':
            if(passage.author._id.toString() == user._id.toString()){
                passage.public = true;
            }
            break;
        case 'personal':
            if(passage.author._id.toString() == user._id.toString()){
                passage.personal = true;
            }
            break;
        case 'cross-origin-allowed':
            if(passage.author._id.toString() == user._id.toString()){
                passage.personal_cross_origin = true;
            }
            break;
        case 'request-public-daemon':
            if(passage.author._id.toString() == user._id.toString()){
                passage.public_daemon = 1;
            }
            break;
        case 'admin-make-public-daemon':
            if(user.admin){
                passage.public_daemon = 2;
            }
            break;
    }
    await passage.save();
    res.send("Done")
});
app.post('/remove_user', async (req, res) => {
    let passageId = req.body.passageId;
    let user_id = req.body.user_id;
    let passage = await Passage.findOne({_id: passageId});
    if(req.session.user && req.session.user._id == passage.users[0]._id){
        passage.users.forEach(function(u, index){
            if(u == user_id){
                //remove user
                passage.users.splice(index, 1);
            }
        });
        await passage.save();
        res.send("Done.");
    }
});
app.post('/remove_bookmark', async (req, res) => {
    let _id = req.body._id;
    let user = await User.findOne({_id: req.session.user._id});
    user.bookmarks.forEach((bookmark, i) => {
        if(bookmark._id.toString() == _id.toString()){
            user.bookmarks.splice(i, 1);
        }
    });
    await user.save();
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
    if (event.type === 'checkout.session.completed') {
        let amount = payload.data.object.amount;
        //Save recording passage in database and give user correct number of stars
        //get user from email
        let user = await User.findOne({_id: payload.data.object.customer_details.email});
        if(user){
            let passage = await Passage.create({
                author: user._id,
                users: [user._id],
                title: 'Donation',
                content: amount,
                systemRecord: true
            });
            let MainSystemRecord = await GetMainSystemRecord();
            let systemContent = JSON.parse(MainSystemRecord.content);
            let totalUSD = systemContent.usd;
            let totalStarCount = systemContent.stars;
            let starsToAdd = percentUSD(amount, totalUSD) * totalStarCount;
            user.stars += starsToAdd;
            await user.save();
        }
    }
    else if(event.type == "invoice.paid"){
        var email = payload.data.object.customer_email;
        if(email != null){
            var subscriber = await User.findOne({email: email});
            subscriber.subscribed = true;
            subscriber.lastSubscribed = Date.now().toString();
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
app.get('/eval/:passage_id', async function(req, res){
    var passage_id = req.params.passage_id;
    var passage = await Passage.findOne({_id: passage_id});
    //stick together code for all sub passages
    var all = {
        html: [passage.html],
        css: [passage.css],
        javascript: [passage.javascript]
    };
    function getAllSubPassageCode(passage, all){
        if(passage.passages){
            passage.passages.forEach((p)=>{
                all.html += p.html === undefined ? '' : p.html;
                all.css += p.css === undefined ? '' : p.css;
                all.javascript += p.javascript === undefined ? '' : p.javascript;
                getAllSubPassageCode(p, all);
            });
        }
        return all;
    }
    getAllSubPassageCode(passage, all);
    res.render("eval", {passage: passage, all: all});
});
app.get('/passage/:passage_title/:passage_id', async function(req, res){
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
    let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
    var passage_id = req.params.passage_id;
    var passage = await Passage.findOne({_id: passage_id, systemRecord: false}).populate('parent author users sourceList');
    let passageUsers = [];
    if(passage.users != null && passage.users[0] != null){
        console.log(passage.users);
        passage.users.forEach(function(u){
            passageUsers.push(u._id.toString());
        });
    }
    var subPassages = await Passage.find({parent: passage_id, systemRecord: false}).populate('author users sourceList').limit(DOCS_PER_PAGE);
    res.render("index", {subPassages: subPassages, passageTitle: decodeURI(passageTitle), passageUsers: passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: passage, passages: false});
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
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            // Create a Stripe account for this user if one does not exist already
            if (accountId === null) {
                const account = await stripe.accounts.create({
                    type: 'express',
                    capabilities: {
                        transfers: {requested: true},
                    },
                  });
                try{
                    await User.updateOne({id: user.id}, {stripeAccountId: account.id});
                }
                catch(error){
                    console.error(error);
                }
                console.log(user);
                // Create an account link for the user's Stripe account
                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: 'https://christianengineeringsolutions.com/stripeAuthorize',
                    return_url: 'https://christianengineeringsolutions.com/stripeOnboarded',
                    type: 'account_onboarding'
                });
                console.log(accountLink);
                // Redirect to Stripe to start the Express onboarding flow
                res.redirect(accountLink.url);
            }
            else{
                console.log("Already has account.");
                let account = await User.findOne({_id: user._id});
                // Create an account link for the user's Stripe account
                const accountLink = await stripe.accountLinks.create({
                    account: account.stripeAccountId,
                    refresh_url: 'https://christianengineeringsolutions.com/stripeAuthorize',
                    return_url: 'https://christianengineeringsolutions.com/stripeOnboarded',
                    type: 'account_onboarding'
                });
                console.log(accountLink);
                // Redirect to Stripe to start the Express onboarding flow
                res.redirect(accountLink.url);
            }
          } catch (err) {
            console.log('Failed to create a Stripe account.');
            console.log(err);
            // next(err);
          }
    }
});
// app.get('/stripeOnboarded', async (req, res, next) => {
//     try {
//       // Retrieve the user's Stripe account and check if they have finished onboarding
//       const account = await stripe.account.retrieve(req.user.stripeAccountId);
//       if (account.details_submitted) {
//         req.user.onboardingComplete = true;
//         req.user.save(function(){
//             res.redirect('/profile');
//         });
//       } else {
//         console.log('The onboarding process was not completed.');
//         res.redirect('/profile');
//       }
//     } catch (err) {
//       console.log('Failed to retrieve Stripe account information.');
//       console.log(err);
//       next(err);
//     }
//   });

app.post('/login', function(req, res) {
    //check if email has been verified
    authenticateUsername(req.body.username, req.body.password, function(err, user){
        if(err){
            console.log(err);
        }
        if(!user){
            res.redirect('/loginform');
        }
        else{
            req.session.user = user;
            res.redirect('/profile/' + user._id);
        }
    });
});
app.get('/admin', function(req, res){
    if(!req.session.user || !req.session.user.admin){
        return res.redirect('/');
    }
});
app.post('/register/', async function(req, res) {
    if ((req.body.email ||
      req.body.username) &&
      req.body.password &&
      req.body.passwordConf && 
      req.body.password == req.body.passwordConf) {  
        let numUsers = await User.countDocuments({username: req.body.username.trim()}) + 1;
        var userData = {
        email: req.body.email || '',
        name: req.body.username || req.body.email,
        username: req.body.username.split(' ').join('.') + '.' + numUsers || '',
        password: req.body.password,
        token: v4()
      }  //use schema.create to insert data into the db
      User.create(userData, function (err, user) {
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
          if(user.email.length > 1){
            sendEmail(user.email, 'Verify Email for Christian Engineering Solutions', 
                `
                    https://christianengineeringsolutions.com/verify/`+user._id+`/`+user.token+`
                `);
          }
          res.redirect('/profile/' + user._id);
        }
      });
    }
});
app.post('/update_settings/', async function(req, res) {
    if ((req.body.email ||
      req.body.username) &&
      req.body.password &&
      req.body.passwordConf && 
      req.body.password == req.body.passwordConf &&
      req.body.oldPassword) {  
        authenticateUsername(req.body.oldUsername, req.body.oldPassword, function(err, user){
            if(err){
                console.log(err);
            }
            req.session.user = user;
            user.username = req.body.username;
            user.email = req.body.email;
            user.password = bcrypt.hash(req.body.password, 10, async function (err, hash){
                if (err) {
                  console.log(err);
                }
                user.password = hash;
                await user.save();
                res.redirect('/profile/' + user._id);
            });
        });
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
//simply return new object list for client to add into html
app.post('/paginate', async function(req, res){
    console.log('test');
    let page = req.body.page;
    let profile = req.body.profile; //home, profile, or leaderboard
    let search = req.body.search;
    let parent = req.body.passage;
    if(profile != 'leaderboard'){
        let find = {
            title: new RegExp(''+search+'', "i")
        };
        if(parent != 'root'){
            find.parent = parent;
        }
        if(profile != 'false'){
            find.author = profile;
        }
        if(req.body.from_ppe_queue){
            find.mimeType = 'image';
        }
        find.systemRecord = false;
        let passages = await Passage.paginate(find, {page: page, limit: DOCS_PER_PAGE, populate: 'author users'});
        if(!req.body.from_ppe_queue){
            return res.render('passages', {
                subPassages: false,
                passages: passages.docs,
                sub: true
            });
        }
        else{
            res.render('ppe_thumbnails', {
                thumbnails: passages.docs,
            });
        }
    }
    else{
        let find = {
            username: new RegExp(''+search+'', "i")
        };
        let users = await User.paginate(find, {page: page, limit: DOCS_PER_PAGE});
        res.render('leaderboard', {users: users.docs});
    }
});

app.post(/\/delete_passage\/?/, (req, res) => {
    var backURL=req.header('Referer') || '/';
    passageController.deletePassage(req, res, function(){
        res.send(backURL);
    });
});

app.use('/passage', passageRoutes);
app.get('/passage_form/', (req, res) => {
    res.render('passage_form');
});
app.post('/create_passage/', async (req, res) => {
    if(!req.session.user){
        return res.send("Not logged in.");
    }
    let user = req.session.user || null;
    let users = null;
    let parentPassageId = req.body.passageID;
    let parentId = null;
    var isRoot = parentPassageId == 'root';
    var parent;
    if(isRoot){
        parentId = null;
    }
    else{
        parentId = parentPassageId;
        parent = await Passage.findOne({_id: parentId});
        if(!scripts.isPassageUser(req.session.user, parent) && !parent.public){
            return res.send("Must be on userlist.");
        }
    }
    if(user){
        users = [user];
    }
    let passage = await Passage.create({
        author: user,
        users: users,
        parent: parentId
    });
    if(!isRoot){
        //add passage to parent sub passage list
        parent.passages.push(passage);
        await parent.save();
    }
    let find = await Passage.findOne({_id: passage._id}).populate('author sourceList');
    res.render('passage', {subPassages: false, passage: find, sub: true});
});
app.post('/star_passage/', async (req, res) => {
    var passage_id = req.body.passage_id;
    var user = req.session.user;
    var amount = parseInt(req.body.amount);
    //get user from db
    let sessionUser = await User.findOne({_id: user._id});
    if(req.session && user){
        if(sessionUser.stars > amount){
            //user must trade their own stars
            sessionUser.stars -= amount;
            let passage = await starPassage(amount, req.body.passage_id, sessionUser._id);
            await sessionUser.save();
            return res.render('passage', {subPassages: false, passage: passage, sub: true});
        }
        else{
            return res.send("Not enough stars!");
        }
    }
});
app.post('/update_passage_order/', async (req, res) => {
    let passage = await Passage.findOne({_id: req.body._id});
    if(req.session.user && req.session.user._id.toString() == passage.author.toString()){
        var passageOrder = [];
        if(typeof req.body.passageOrder != 'undefined'){
            var passageOrder = JSON.parse(req.body.passageOrder);
            let trimmedPassageOrder = passageOrder.map(str => str.trim());
            passage.passages = trimmedPassageOrder;
            await passage.save();
        }
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
    const fsp = require('fs').promises
    await fsp.writeFile('./dist/uploads/'+uploadTitle, buf);
    let passage = await Passage.create({
        author: req.session.user,
        users: [req.session.user],
        parent: req.body.parent == 'root' ? null: req.body.parent,
        filename: uploadTitle,
        mimeType: 'image'
    });
    var newOne = await Passage.find({_id: passage._id});
    if(req.body.parent !== 'root'){
        let Parent = await Passage.findOne({_id: req.body.parent});
        Parent.passages.push(newOne);
        await Parent.save();
    }
    let find = await Passage.findOne({_id: passage._id});
    res.render('ppe_thumbnail', {thumbnail: find});
});
app.get('/ppe_queue', async (req, res) => {
    let passages = await Passage.find({
        parent: req.body.parent == 'root' ? null : req.body.parent,
        mimeType: 'image'
    });
    console.log('test');
    return res.render('ppe_thumbnails', {thumbnails: passages});
});
app.post('/update_passage/', async (req, res) => {
    var _id = req.body._id;
    var formData = req.body;
    var passage = await Passage.findOne({_id: _id}).populate('author users sourceList');
    if(passage.author._id.toString() != req.session.user._id.toString()){
        return res.send("You can only update your own passages.");
    }
    passage.html = formData.html;
    passage.css = formData.css;
    passage.javascript = formData.js;
    passage.title = formData.title;
    passage.content = formData.content;
    passage.tags = formData.tags;
    var uploadTitle = '';
    if (!req.files || Object.keys(req.files).length === 0) {
        //no files uploaded
        console.log("No files uploaded.");
        passage.filename = passage.filename;
    }
    else{
        console.log('File uploaded');
        // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
        let fileToUpload = req.files.file;
        let mimetype = req.files.file.mimetype;
        //uuid with  ext
        uploadTitle = v4() + "." + fileToUpload.name.split('.').at(-1);
        //first verify that mimetype is image
        console.log(mimetype);
        // Use the mv() method to place the file somewhere on your server
        fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
            if (err){
                return res.status(500).send(err);
            }
        });
        passage.filename = uploadTitle;
        passage.mimeType = mimeType.split('/')[0];
    }
    await passage.save();
    //give back updated passage
    return res.render('passage', {subPassages: false, passage: passage, sub: true});
});
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

/*
    ROUTERS FOR FILESTREAM
*/
// if(process.env.DOMAIN == 'localhost'){
//     app.post('/server_eval', function(req, res) {
//         eval(req.code);
//     });
// }
// app.post('/fileStream', function(req, res) {
//     var result = '';
//     var dir = __dirname + '/';
//     fs.readdir(dir, (err, files) => {
//       var ret = '';
//       var stat2;
//       files.forEach(function(file){
//         stat2 = fs.lstatSync(dir + '/' +file);
//         if(stat2.isDirectory()){
//             file += '/';
//         }
//         ret += scripts.printDir(file);
//       });
//       res.send({
//         dirs: ret,
//         type: 'dir',
//         path: dir
//       });
//     });
// });
// app.post('/file', function(req, res) {
//     var file = req.body.fileName;
//     if(req.body.dir[req.body.dir.length - 1] == '/'){
//         var dir = req.body.dir + file;
//     }
//     else{
//         var dir = req.body.dir + '/' + file;
//     }
//     var stat = fs.lstatSync(dir);
//     if(stat.isFile()){
//         fs.readFile(dir, {encoding: 'utf-8'}, function(err,data){
//                 if (!err) {
//                     res.send({
//                         data: scripts.printFile(data, __dirname + '/' +file),
//                         type: 'file'
//                     });
//                 } else {
//                     console.log(err);
//                 }
//         });
//     }
//     else if (stat.isDirectory()){
//         fs.readdir(dir, (err, files) => {
//           var ret = '<div class="directory_list">';
//           ret += `<div>
//             <a class="link fileStreamChapter fileStreamCreate">Create</a>
//           </div>`;
//           var stat2;
//           files.forEach(function(file){
//             stat2 = fs.lstatSync(dir + '/' +file);
//             if(stat2.isDirectory()){
//                 file += '/';
//             }
//             ret += scripts.printDir(file);
//           });
//           ret += '</div>';
//           res.send({
//             data: ret,
//             type: 'dir',
//             dir: dir
//           });
//         });
//     }
// });
// app.post('/run_file', function(req, res) {
//     var file = req.body.file;
//     var ext = file.split('.')[file.split('.').length - 1];
//     var bash = 'ls';
//     switch(ext){
//         case 'js':
//         bash = 'node ' + file;
//         break;
//         case 'sh':
//         bash = 'sh ' + file;
//         break;
//     }
//     exec(bash, (err, stdout, stderr) => {
//       if (err) {
//         // node couldn't execute the command
//         res.send(JSON.stringify(err));
//         return;
//       }
//       res.send(stdout);
//       // the *entire* stdout and stderr (buffered)
//       // console.log(`stdout: ${stdout}`);
//       // console.log(`stderr: ${stderr}`);
//     });
// });
// app.post('/update_file', function(req, res) {
//     var file = req.body.file;
//     var content = req.body.content;
//     fs.writeFile(file, content, function(err){
//       if (err) return console.log(err);
//       res.send('Done');
//     });
// });
app.post('/ppe', function(req, res) {
    Passage.find({canvas: true})
    .limit(20)
    .exec()
    .then(function(passages){
        var ret = '';
        passages.forEach(passage => {
            ret += scripts.printCanvas(passage, req.session.user);
        });
        res.send(ret);
    });
});
app.get('/terms', function(req, res) {
    res.render('terms');
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
function authenticateUsername(username, password, callback) {
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
    User.findOne(obj)
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
function sendEmail(to, subject, body){
    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    var mailOptions = {
      from: 'christianengineeringsolutions@gmail.com',
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
function requiresLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    var err = new Error('You must be logged in to view this page.');
    err.status = 401;
    return next(err);
  }
}



// CLOSING LOGIC
var server = app.listen(PORT, () => {
    console.log(`Sasame started on Port ${PORT}`);
});
process.on('uncaughtException', function(err){
    console.log('uncaughtExceptionError');
    console.log(err);
    server.close();
});
process.on('SIGTERM', function(err){
    console.log('SIGTERM');
    console.log(err);
    server.close();
});
