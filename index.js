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
const Chapter = require('./models/Chapter');
const Passage = require('./models/Passage');
// Controllers
const chapterController = require('./controllers/chapterController');
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
const scripts = require('./shared');
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
app.get('/shared.js', function(req, res) {
    res.sendFile(__dirname + '/shared.js');
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
app.get('/marked.min.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/marked/marked.min.js');
});
app.get('/highlight.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/highlight.js/lib/highlight.js');
});
app.get('/highlight/javascript.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/highlight.js/lib/languages/javascript.js');
});
app.get('/highlight/default.css', function(req, res) {
    res.sendFile(__dirname + '/node_modules/highlight.js/styles/tomorrow.css');
});
app.get('/codemirror.css', function(req, res) {
    res.sendFile(__dirname + '/node_modules/codemirror/lib/codemirror.css');
});
app.get('/codemirror.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/codemirror/lib/codemirror.js');
});
app.get('/mode/:mode/:mode.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/codemirror/mode/'+req.params.mode+'/'+req.params.mode+'.js');
});
app.get('/quill.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/quill/dist/quill.min.js');
});
app.get('/quill.snow.css', function(req, res) {
    res.sendFile(__dirname + '/node_modules/quill/dist/quill.snow.css');
});
app.get('/tone.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/tone/build/Tone.js');
});
app.get('/sigma.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/sigma/build/sigma.min.js');
});
app.get('/sigma.parsers.json.js', function(req, res) {
    res.sendFile(__dirname + '/node_modules/sigma/build/plugins/sigma.parsers.json.min.js');
});
//CRON
var cron = require('node-cron');
cron.schedule('0 12 * * *', () => {
  //run daily methods
  //...
  console.log('Daily Cron ran at 12pm.');
});
//run monthly cron
cron.schedule('0 12 1 * *', async () => {
    //...
    //await rewardUsers();
    console.log('Monthly Cron ran at 12pm.');
});

//Get total star count and pay out users
async function rewardUsers(){
    let users = await User.find({stripeAccountId: {$ne: null}});
    let systemContent = JSON.parse(GetMainSystemRecord().content);
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
    let passage = await Passage.findOne({_id: passageID});
    passage.stars += amount;
    await passage.save();
    passage.sourceList.forEach(async function(source){
        await starPassage(amount, source._id, userID);
    });
    (function lambda(passage){
        passage.passages.forEach(async function(p){
            await starPassage(amount, p._id, userID);
            lambda(p);
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
async function messageUser(from, to, subject, content){
    let message = await Message.create({
        from: from,
        to: to,
        subject: subject,
        content: content
    });
}
//ROUTES
//GET (or show view)

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
    let passages = await Passage.find({users: profile}).populate('users sourceList');
    if(req.session.user){
        bookmarks = await User.find({_id: req.session.user._id}).populate('passages').passages;
    }
    // console.log(profile[0].username);
    res.render("profile", {passages: passages, scripts: scripts, profile: profile, bookmarks: bookmarks});
});
app.get('/loginform', function(req, res){
    res.render('login_register', {scripts: scripts});
  });
app.post('/get_username_number', async function(req, res){
    let name = req.body.name;
    let number = await User.countDocuments({username:name.trim()}) + 1;
    if(number - 1 === 0){
        number = '';
    }
    console.log(number);
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
    let passages = await Passage.find().populate('users sourceList');
    let bookmarks = [];
    if(req.session.user){
        bookmarks = await User.find({_id: req.session.user._id}).populate('bookmarks').passages;
    }
    res.render("index", {
        passageTitle: 'Christian Engineering Solutions', 
        scripts: scripts, 
        passages: passages, 
        passage: {id:'root'},
        bookmarks: bookmarks
    });
});
//Search
app.get('/search/:query', async (req, res) => {
    let results = await Passage.find({title: {
        $regex: req.params.query,
        $options: 'i'
    }}).populate('users sourceList');
    res.render("passages", {
        passages: results
    });
});
app.post('/bookmark_passage', async (req, res) => {
    let user = await User.findOne({_id: req.session.user._id});
    user.bookmarks.push(req.body._id);
    await user.save();
    res.send('done.');
});
app.post('/transfer_bookmark', async (req, res) => {
    let _id = req.body._id;
    //First copy the passage
    let copy = await passageController.copyPassage(req, res, function(){
        
    });
    //Then move the copy into the current tab
    let tab = await Passage.findOne({_id: req.body.tab_id});
    tab.passages.push(copy._id);
    copy.parent = tab._id;
    await tab.save();
    await copy.save();
    res.render('passage', {passage: copy, sub: true});
});
app.get('/get_bookmarks', async (req, res) => {
    let bookmarks = [];
    if(req.session.user){
        let user = await User.findOne({_id: req.session.user._id}).populate('bookmarks');
        bookmarks = user.bookmarks;
    }
    res.render('bookmarks', {bookmarks: bookmarks});
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
        console.log(payload.data.object.amount);
        console.log(event.type);
    } catch (err) {
        console.log(err);
        //console.log(response.status(400).send(`Webhook Error: ${err.message}`));
        return;
        // return response.status(400).send(`Webhook Error: ${err.message}`);
    }
    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        let amount = payload.data.object.amount;
        //Save recording passage in database and give user correct number of stars
        //get user from email
        let user = await User.find({_id: request.session.user._id});
        let passage = await Passage.create({
            users: [request.session.user._id],
            title: 'Donation',
            content: amount,
            systemRecord: true
        });
        let systemContent = JSON.parse(GetSystemRecord().content);
        let totalUSD = systemContent.usd;
        let totalStarCount = systemContent.stars;
        let starsToAdd = percentUSD(amount, totalUSD) * totalStarCount;
        user.stars += starsToAdd;
        await user.save();
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
    var passage = await Passage.findOne({_id: passage_id}).populate('users sourceList');
    res.render("index", {passageTitle: decodeURI(passageTitle), Passage: Passage, scripts: scripts, sub: false, passage: passage, passages: false});
});
app.get('/donate', async function(req, res){
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
        cancel_url: 'https://example.com',
        line_items: [{price: '{{PRICE_ID}}'
    , quantity: 1}],
        mode: 'payment',
        success_url: 'https://example.com',
    });
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
            // Create a Stripe account for this user if one does not exist already
            if (accountId === null) {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                const account = await stripe.accounts.create({
                    type: 'express',
                    capabilities: {
                        transfers: {requested: true},
                    },
                  });
                try{
                    user = await User.updateOne({id: user.id}, {stripeAccountId: account.id});
                }
                catch(error){
                    console.error(error);
                }
                console.log(user);
                // Create an account link for the user's Stripe account
                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: 'http://localhost:3000/stripeAuthorize',
                    return_url: 'http://localhost:3000/stripeOnboarded',
                    type: 'account_onboarding'
                });
                console.log(accountLink);
                // Redirect to Stripe to start the Express onboarding flow
                res.redirect(accountLink.url);
            }
            else{
                console.log("Already has account.");
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
        req.session.user = user;
        return res.redirect('/profile/' + user._id);
    });
});
app.post('/register/', async function(req, res) {
    if ((req.body.email ||
      req.body.username) &&
      req.body.password &&
      req.body.passwordConf) {  
        let numUsers = await User.countDocuments({username: req.body.username.trim()}) + 1;
        var userData = {
        email: req.body.email || '',
        username: req.body.username + numUsers || '',
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
          // sendEmail(user.email, 'Verify Email for Sasame', 
          //     `
          //         https://sasame.xyz/verify/`+user.id+`/`+user.token+`
          //     `);
          res.redirect('/profile/' + user._id);
        }
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
app.post('/paginate', function(req, res){
    let page = req.body.page;
    let which = req.body.which; //chap or passage
    let search = req.body.search;
    //what category is the user looking at?
    let chapter = req.body.chapter;
    let find = {chapter: chapter.trim()};
    if(chapter.trim() == 'Sasame'){
        find = {
            deleted: false,
            queue: false
        };
    }
    if(search == ''){
        var chapterFind = {};
    }
    else{
        var chapterFind = {
            title: new RegExp(''+search+'', "i")
        };
    }
    if(which == 'passage_load'){
        Passage.paginate(find, {page: page, limit: DOCS_PER_PAGE, populate: 'chapter', sort: [['_id', -1]]})
        .then(function(passages){
            res.send(JSON.stringify(passages));
        }).then(function(err){
            if(err) console.log(err);
        });
    }
    else if(which == 'chapter_load' || which == 'chapter_load_mobile'){
        Chapter.paginate(chapterFind, {page: page, limit: DOCS_PER_PAGE, sort: 'stars', select: 'title'})
        .then(function(chapters){
            res.send(JSON.stringify(chapters));
        }).then(function(err){
            if(err) console.log(err);
        });
    }
});
app.post('/add_to_queue', (req, res) =>{
  var _id = req.body.passage.trim();
  Passage.findOne({_id: _id}, function(err, passage){
    //and add to queue
    duplicatePassage(req, passage);
    // console.log(ret.content);
    // res.send(scripts.printPassage(ret)); //send the passage back
  });
});
app.post('/add_from_queue', (req, res) =>{
  var _id = req.body.passageID.trim();
  var chapterID = req.body.chapterID.trim();
  Chapter.findOne({_id: chapterID}, function(err, chapter){
    Passage.findOne({_id: _id})
    .populate('author')
    .exec()
    .then(function(passage){
      //remove from authors queue
      passage.author.queue = passage.author.queue.filter(e => e !== passage._id);
      //no longer in queue
      passage.queue = false;
      //remove from old chapter (shouldn't be an old chapter)
      // passage.chapter.passages = passage.chapter.passages.filter(e => e !== passage._id);
      // passage.chapter.save();
      //add to new chapter
      chapter.passages.push(passage);
      //change chapter location
      passage.chapter = chapter;
      //then save all
      passage.author.save();
      passage.save();
      chapter.save();
      res.send('Done');
    });
  });
});
app.post('/get_queue', (req, res) =>{
  if(req.session.user){
    var ret = '';
    User.findOne({_id: req.session.user})
    .select('queue')
    .populate('queue')
    .exec()
    .then(function(user){
      user.queue.forEach(function(q){
        if(!q.deleted){
          ret += scripts.printPassage(q);
        }
      });
      res.send(ret);
    });
  }
  else{
    res.send('<span style="color:#000;">Must be logged in.</span>');
  }
});
app.post(/\/create_queue_chapter\/?/, (req, res) => {
    var user = req.session.user_id || null;
    var passages = JSON.parse(req.body.passages);
    chapterController.addChapter({
        'title': req.body.title,
        'author': user,
        'callback': function(chapter){
            for(var key in passages){
                var parentPassage = passages[key].parentPassage || '';
                //build metadata from separate arrays
                var json = passages[key].metadata;
                var canvas = json.canvas || false;
                passageController.addPassage({
                    'chapter': chapter._id,
                    'content': passages[key].content,
                    'author': user,
                    // 'sourceAuthor': passage.user,
                    // 'sourceChapter': passages[key].chapter,
                    'canvas': canvas,
                    'metadata': JSON.stringify(json),
                    'callback': function(psg){
                        // console.log(psg);
                    },
                    'parentPassage': parentPassage
                });
            }
            res.send(scripts.printChapter(chapter));
        }
    });
});
//add passage or chapter
app.post(/\/add_passage\/?/, (req, res) => {
    var chapterID = req.body.chapterID;
    var type = req.body.type;
    var user = req.session.user || null;
    var content = req.body.passage || '';
    var parentPassage = req.body.parentPassage || '';
    var property_key = req.body['property_key[]'] || req.body.property_key;
    var property_value = req.body['property_value[]'] || req.body.property_value;
    var dataURL = req.body.dataURL || false;
    //build metadata from separate arrays
    var metadata = generateMetadata(property_key, property_value);
    var json = metadata.json;
    var canvas = metadata.canvas;
    var categories = req.body.tags;
    var uploadTitle = '';
    //image from Canvas
    if(dataURL){
        uploadTitle = v4();
        var data = dataURL.replace(/^data:image\/\w+;base64,/, "");
        var buf = new Buffer(data, 'base64');
        fs.writeFile('./dist/uploads/'+uploadTitle, buf);
    }
    //express-fileupload
    if (!req.files || Object.keys(req.files).length === 0) {
        //no files uploaded
        // console.log("No files uploaded.");
    }
    else{
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
      let fileToUpload = req.files.file;
      let mimetype = req.files.file.mimetype;
      uploadTitle = v4();
      //first verify that mimetype is image
      console.log(mimetype);
      // Use the mv() method to place the file somewhere on your server
      fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
        if (err){
            return res.status(500).send(err);
        }
      });
    }
    var passageCallback = function(data){
        if(req.body.special && req.body.special == 'ppe_queue'){
            res.send(scripts.printCanvas(data));
        }
        else{
            res.send(scripts.printPassage(data, req.session.user));
        }
    };
    var chapterCallback = function(data){
        res.send(scripts.printChapter(data));
    };
    if(type == 'passage'){
        passageController.addPassage({
            'chapter': chapterID,
            'content': content,
            'author': user,
            'canvas': canvas,
            'metadata': JSON.stringify(json),
            'callback': passageCallback,
            'parentPassage': parentPassage,
            'filename': uploadTitle,
            'categories': categories
        });
    }
    else if(type == 'chapter' && content != ''){
        console.log(JSON.stringify(req.body));
        chapterController.addChapter({
            'title': content,
            'author': user,
            'callback': chapterCallback,
            'categories': categories
        });
    }
});

app.post(/\/delete_passage\/?/, (req, res) => {
    var backURL=req.header('Referer') || '/';
    passageController.deletePassage(req, res, function(){
        res.send(backURL);
    });
});
app.post(/\/delete_category\/?/, (req, res) => {
    var chapterID = req.body._id;
    //delete chapter
    //in the future consider also deleting all passages within this chapter
    Chapter.deleteOne({_id: chapterID.trim()}, function(err){
        if(err){
            console.log(err);
        }
        res.send('Deleted.');
    });
});
app.post(/\/chapters\/?/, (req, res) => {
    var backURL=req.header('Referer') || '/';
    let title = req.body.search;
    Chapter.find({title: new RegExp(''+title+'', "i")})
    .select('title flagged')
    .sort('stars')
    .limit(DOCS_PER_PAGE)
    .exec(function(err, chapters){
        let html = '';
        if(chapters){
            chapters.forEach(function(f){
                html += scripts.printChapter(f);
            });
        }
        res.send(html);
    });
});
//CHANGE TO GET REQUEST
app.get(/\/passages\/?/, (req, res) => {
    // res.header("Access-Control-Allow-Origin", "*");
    // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    var backURL=req.header('Referer') || '/';
    let title = req.body.search;
    var tick = 0;
    var temp = '';
    Passage.find({
        parent: undefined,
        deleted: false,
        visible: true,
        flagged: false,
        queue: false
    })
    .populate('chapter author')
    .sort('stars')
    .limit(DOCS_PER_PAGE)
    .exec(function(err, passages){
        let html = '';
        if(passages){
            passages.forEach(function(f){
                temp = f.id[f.id.length-1];
                if(temp == 'c'){
                    tick = 1;
                }
                html += scripts.printPassage(f, tick);
                tick = 0;
            });
        }
        res.send(html);
    });
});

app.use('/passage', passageRoutes);
app.get('/passage_form/', (req, res) => {
    res.render('passage_form');
});
app.post('/create_passage/', async (req, res) => {
    let user = req.session.user || null;
    let users = null;
    let parentPassageId = req.body.passageID;
    let parentId = null;
    var isRoot = parentPassageId == 'root';
    if(isRoot){
        parentId = null;
    }
    else{
        parentId = parentPassageId;
    }
    if(user){
        users = [user];
    }
    let passage = await Passage.create({
        users: users,
        parent: parentId
    });
    if(!isRoot){
        //add passage to parent sub passage list
        let parent = await Passage.findOne({_id: parentId});
        parent.passages.push(passage);
        await parent.save();
    }
    res.render('passage', {passage: passage, sub: true});
});
app.post('/search/', (req, res) => {
    let title = req.body.title;
    Chapter.find({title: new RegExp(''+title+'', "i")})
    .select('title flagged')
    .sort('stars')
    .limit(DOCS_PER_PAGE)
    .exec(function(err, chapters){
        let html = '';
        if(chapters){
            chapters.forEach(function(f){
                html += scripts.printChapter(f);
            });
        }
        res.send(html);
    });
});
app.post('/search_category/', (req, res) => {
    let title = req.body.title;
    Passage.find({categories: new RegExp(''+title+'', "i") })
    .sort('stars')
    .limit(DOCS_PER_PAGE)
    .exec(function(err, passages){
        let html = '';
        if(passages){
            passages.forEach(function(p){
                html += scripts.printPassage(p);
            });
        }
        res.send(html);
    });
});
app.post('/flag_passage', (req, res) => {
    var _id = req.body._id.trim();
    Passage.findOne({_id: _id}, function(err, passage){
        passage.flagged = true;
        passage.save();
    });
});
app.post('/star_passage/', async (req, res) => {
    var passage_id = req.body.passage_id;
    var user = req.session.user;
    //get user from db
    let sessionUser = await User.findOne({_id: user._id});
    if(req.session && user){
        //Since this is a manual star, user must trade their own stars
        sessionUser.stars -= parseInt(req.body.amount);
        if(sessionUser.stars > 0){
            let passage = await starPassage(parseInt(req.body.amount), req.body.passage_id, sessionUser._id);
            await sessionUser.save();
            res.render('passage', {passage: passage, sub: true});
        }
        else{
            res.send("Not enough stars!");
        }
    }
});
app.post('/star_chapter/', (req, res) => {
    if(req.session && req.session.user){
        var _id = req.body._id.trim();
        var user = req.session.user;
        Chapter.findOne({_id: _id})
        .populate('author')
        .exec(function(err, chapter){
            if(user.starsGiven < user.stars * 2 && chapter.author._id != user._id){
                user.starsGiven += 1;
                chapter.stars += 1;
                chapter.author.stars += 1;
                chapter.save();
                chapter.author.save();
                user.save();
                res.send('Done');
            }
            else{
                res.send("You don't have enough stars to give!");
            }
        });
    }
});

app.post('/update_passage/', async (req, res) => {
    var _id = req.body._id;
    var formData = req.body;
    var passage = await Passage.findOne({_id: _id});
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
      uploadTitle = v4();
      //first verify that mimetype is image
      console.log(mimetype);
      // Use the mv() method to place the file somewhere on your server
      fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
        if (err){
            return res.status(500).send(err);
        }
      });
      passage.filename = uploadTitle;
    }
    await passage.save();
    // var passage = await Passage.findOneAndUpdate({_id: _id}, {
    //     html: formData.html,
    //     css: formData.css,
    //     javascript: formData.js,
    //     title: formData.title,
    //     content: formData.content,
    //     tags: formData.tags,
    //     filename: uploadTitle
    // }, {
    //     new: true
    // });
    //give back updated passage
    res.render('passage', {passage: passage, sub: true});
});
app.post('/copy_passage/', async (req, res) => {
    let copy = await passageController.copyPassage(req, res, function(){
        
    });
    let passage = await Passage.findOne({_id: req.body._id});
    res.render('passage', {passage: copy, sub: true});
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

            res.redirect('/login/');
        } else {
            console.log('The token is wrong! Reject the user. token should be: ' + user.verify_token);
        }
    });
});
//recordings
app.get('/recordings', (req, res) => {
  readdir(recordingFolder)
    .then(messageFilenames => {
      res.status(200).json({ messageFilenames });
    })
    .catch(err => {
      console.log('Error reading message directory', err);
      res.sendStatus(500);
    });
});

app.post('/recordings', (req, res) => {
  if (!req.body.recording) {
    return res.status(400).json({ error: 'No req.body.message' });
  }
  const messageId = v4();
  writeFile(recordingFolder + messageId, req.body.recording, 'base64')
    .then(() => {
        res.send(messageId);
    })
    .catch(err => {
      console.log('Error writing message to file', err);
      res.sendStatus(500);
    });
});

/*
    ROUTERS FOR FILESTREAM
*/
if(process.env.DOMAIN == 'localhost'){
    app.post('/server_eval', function(req, res) {
        eval(req.code);
    });
}
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
app.post('/file', function(req, res) {
    var file = req.body.fileName;
    if(req.body.dir[req.body.dir.length - 1] == '/'){
        var dir = req.body.dir + file;
    }
    else{
        var dir = req.body.dir + '/' + file;
    }
    var stat = fs.lstatSync(dir);
    if(stat.isFile()){
        fs.readFile(dir, {encoding: 'utf-8'}, function(err,data){
                if (!err) {
                    res.send({
                        data: scripts.printFile(data, __dirname + '/' +file),
                        type: 'file'
                    });
                } else {
                    console.log(err);
                }
        });
    }
    else if (stat.isDirectory()){
        fs.readdir(dir, (err, files) => {
          var ret = '<div class="directory_list">';
          ret += `<div>
            <a class="link fileStreamChapter fileStreamCreate">Create</a>
          </div>`;
          var stat2;
          files.forEach(function(file){
            stat2 = fs.lstatSync(dir + '/' +file);
            if(stat2.isDirectory()){
                file += '/';
            }
            ret += scripts.printDir(file);
          });
          ret += '</div>';
          res.send({
            data: ret,
            type: 'dir',
            dir: dir
          });
        });
    }
});
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
        obj[search] = username;
    }
    else{
        search = "email";
        obj[search] = email;
    }
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
