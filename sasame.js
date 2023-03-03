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
var io = require('socket.io')(http.Server(app));
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
    //shortcuts for ejs
    res.locals.user = req.session.user;
    res.locals.DOMAIN = process.env.DOMAIN;
    res.locals.LOCAL = process.env.LOCAL;
    if(!req.session.CESCONNECT){
        req.session.CESCONNECT = false;
    }
    res.locals.CESCONNECT = req.session.CESCONNECT;
    res.locals.fromOtro = req.query.fromOtro || false;
    //DEV AUTO LOGIN
    if(!req.session.user && process.env.AUTOLOGIN == 'true' && process.env.DEVELOPMENT == 'true'){
        authenticateUsername("christianengineeringsolutions@gmail.com", "testing", function(err, user){
            req.session.user = user;
            next();
        });
    }
    else{
        try{
            next();
        }
        catch(error){
            console.log(error);
        }
    }
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
const { exit } = require('process');
const { response } = require('express');
// const { getMode } = require('ionicons/dist/types/stencil-public-runtime');
//run monthly cron
cron.schedule('0 12 1 * *', async () => {
    await rewardUsers();
    console.log('Monthly Cron ran at 12pm.');
});

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
    //80% of funds to users
    var usd = totalUSD() * 0.80;
    let users = await User.find({stripeOnboardingComplete: true});
    for(const user of users){
        //appropriate percentage based on stars
        //users get same allotment as they have percentage of stars
        let userUSD = (await percentStars(user.starsGiven)) * usd;
        const transfer = await stripe.transfers.create({
            amount: userUSD,
            currency: "usd",
            destination: user.stripeAccountId,
        });
    }
}

//get percentage of total stars
async function percentStars(user_stars){
    let final = user_stars / (await totalStars());
    return final;
}
//get percentage of total usd
async function percentUSD(donationUSD){
    let final = donationUSD / (await totalUSD());
    return final;
}
async function totalUSD(){
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const balance = await stripe.balance.retrieve();
    var usd = 0;
    for(const i of balance.available){
        if(i.currency == 'usd'){
            usd = i.amount / 100;
            break;
        }
    }
    return usd;
}
async function totalStars(){
    let users = await User.find({stripeOnboardingComplete: true});
    var stars = 0;
    for(const user of users){
        stars += user.starsGiven;
    }
    return stars;
}

async function starPassage(req, amount, passageID, userID){
    let user = await User.findOne({_id: userID});
    if(user.stars < amount){
        return "Not enough stars.";
    }
    user.stars -= amount;
    let passage = await Passage.findOne({_id: passageID}).populate('author sourceList');
    //add stars to passage and sources
    passage.stars += amount;
    //you have to star someone elses passage to get stars
    if(passage.author._id.toString() != req.session.user._id.toString()){
        user.starsGiven += amount;
        passage.author.stars += amount;
        await passage.author.save();
    }
    await user.save();
    await passage.save();
    //star each source
    for(const source of passage.sourceList){
        let sourceAuthor = await User.findOne({_id: source.author._id});
        //you won't get extra stars for citing your own work
        if(sourceAuthor._id.toString() != req.session.user._id.toString() && sourceAuthor._id.toString() != passage.author._id.toString()){
            source.stars += amount;
            sourceAuthor.stars += amount;
            await sourceAuthor.save();
            await source.save();
        }
    }
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
app.get("/profile/:username?/:_id?/", async (req, res) => {
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
    let find = {author: profile, deleted: false};
    //if it's their profile show personal passages
    // if(req.session.user && profile._id.toString() == req.session.user._id.toString()){
    //     find.$or = [{personal: true}, {personal: false}];
    // }
    let passages = await Passage.find(find).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    if(req.session.user){
        bookmarks = await User.find({_id: req.session.user._id}).populate('passages').passages;
    }
    var usd = parseInt((await percentStars(profile.starsGiven)) * (await totalUSD()));
    res.render("profile", {usd: usd, subPassages: false, passages: passages, scripts: scripts, profile: profile, bookmarks: bookmarks});
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
        var passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList');

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
    var buf = Buffer.from(req.body.file, 'base64');
    await fsp.writeFile('./dist/uploads/'+uploadTitle, buf);
    passage.sourceList = [];
    passage.sourceLink = process.env.DOMAIN + '/' + passage.title + '/' + passage._id;
    var pushingAuthor = await User.findOne({email: passage.author.email}) || req.session.user;
    var copy = await passageController.copyPassage(passage, [pushingAuthor || req.session.user], null, function(){

    });
    copy.filename = uploadTitle;
    await copy.save();
    //TODO: modify copy to ensure thumbnail creation onload
    //...

    //bookmark passage
    await bookmarkPassage(copy._id, pushingAuthor._id);
    //local is recieving a passage from a remote sasame
    //associate proper file
    if(process.env.LOCAL == 'true'){
        //file from passage
        const file = fs.createReadStream('./dist/uploads/' + v4() + passage.filename.split('.').at(-1));
        const request = https.get('https://christianengineeringsolutions.com/uploads/' + passage.filename, function(response){
            response.pipe(file);
            file.on('finish', () => {
                file.close();
            });
        });
        return res.send("Done.");
    }
    //remote is recieving passage from a local sasame
    else if(process.env.REMOTE == 'true'){
	console.log("good");
        //file from form sent by requests module
        //(local sasame may not have public URL)
        //upload main file
        // await uploadFile(req, res, copy);
        return res.send('https://christianengineeringsolutions.com/passage/' + encodeURIComponent(copy.title) + '/' + copy._id);

    }
});


//use email to assign transferred (push or pull) passage to the correct author for merit
function updateTransferredPassageAuthor(){

}

app.get('/get_passage', async (req, res) => {
    return await Passage.findOne({_id: req.params._id});
});
app.post('/passage_from_json', async (req, res) => {
    //copy passage
    var copy = passageController.copyPassage(req.params.passage, [req.session.user], null, function(){
        
    });
    //bookmark passage
    let user = await User.findOne({_id: req.session.user._id});
    user.bookmarks.push(copy._id);
    await user.save();
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
                    var html = '<ion-icon style="float:left;"class="green"id="remote_toggle"title="Remote"src="/images/ionicons/sync-circle.svg"></ion-icon>';
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
                        var _id = getPassageId(this);
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
//index.html
app.get('/', async (req, res) => {
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
    }
});
app.get('/donate', async function(req, res){
    if(req.session.CESCONNECT){
        return getRemotePage(req, res);
    }
    var usd = await totalUSD();
    var stars = await totalStars();
    res.render('donate', {passage: {id: 'root'}, usd: usd, stars: stars});
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
async function bookmarkPassage(_id, _for){
    let user = await User.findOne({_id: _for});
    user.bookmarks.push(_id);
    await user.save();
    return "Done.";
}
app.post('/bookmark_passage', async (req, res) => {
    await bookmarkPassage(req.body._id, req.session.user._id);
    res.send('Done.');
});
// Add security if reactivating check if passage user first
// app.post('/copy_passage/', async (req, res) => {
//     let copy = await passageController.copyPassage(req, res, function(){
        
//     });
//     let passage = await Passage.findOne({_id: req.body._id}).populate('author users sourceList');
//     res.render('passage', {subPassages: false, passage: copy, sub: true});
// });
app.post('/transfer_bookmark', async (req, res) => {
    console.log('times');
    let _id = req.body._id;
    let parent = req.body.parent;
    //first check if parent allow submissions (is Public)
    if(parent !== 'root'){
        let parentPassage = await Passage.findOne({_id: parent});
        if(parentPassage.public === false && parentPassage.author.toString() != req.session.user._id.toString() && !scripts.isPassageUser(req.session.user, parentPassage)){
            return res.send("<h2 style='text-align:center;color:red;'>Passage is private. Ask to be on the Userlist, or consider Bookmarking it, and copying it over to your own passage.</h2>");
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
    let copy = await passageController.copyPassage(passage, user, parent, function(){
        
    });
    res.render('passage', {subPassages: false, passage: copy, sub: true});
});
app.get('/get_bookmarks', async (req, res) => {
    console.log('test');
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
    if(req.session.CESCONNECT){
        return getRemotePage(req, res);
    }
    let users = await User.find().sort('-starsGiven');
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
    switch(setting){
        case 'private':
            if(passage.author._id.toString() == user._id.toString()){
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
        let amount = payload.data.object.amount_total;
        //Save recording passage in database and give user correct number of stars
        //get user from email
        var user = await User.findOne({email: payload.data.object.customer_details.email});
        if(user){
            user.stars += (parseInt(amount) / 100);
            users.stars += (await percentUSD(parseInt(amount))) * (await totalStars());
            await user.save();
        }
    }
    else if(event.type == "invoice.paid"){
        var email = payload.data.object.customer_email;
        if(email != null){
            //they get stars
            //plus time bonus
            var subscriber = await User.findOne({email: email});
            subscriber.subscribed = true;
            subscriber.lastSubscribed = Date.now().toString();
            let monthsSubscribed = monthDiff(Date.parse(subscriber.lastSubscribed), Date.now());
            subscriber.stars += (await percentUSD(80 * monthsSubscribed)) * (await totalStars());
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
  function getStarsFromUSD(usd){
    return percentUSD(usd) * totalStars();
  }
app.get('/eval/:passage_id', async function(req, res){
    if(req.session.CESCONNECT){
        return getRemotePage(req, res);
    }
    var passage_id = req.params.passage_id;
    var passage = await Passage.findOne({_id: passage_id});
    //stick together code for all sub passages
    var all = {
        html: passage.html,
        css: passage.css,
        javascript: passage.javascript
    };
    if(passage.public == false){
        getAllSubPassageCode(passage, all);
    }
    res.render("eval", {passage: passage, all: all});
});
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
app.get('/passage/:passage_title/:passage_id', async function(req, res){
    if(req.session.CESCONNECT){
        return getRemotePage(req, res);
    }
    let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    let urlEnd = fullUrl.split('/')[fullUrl.split('/').length - 1];
    let passageTitle = fullUrl.split('/')[fullUrl.split('/').length - 2];
    var passage_id = req.params.passage_id;
    var passage = await Passage.findOne({_id: passage_id}).populate('parent author users sourceList');
    passage.showIframe = false;
    if(passage == null){
        return res.redirect('/');
    }
    let passageUsers = [];
    if(passage.users != null && passage.users[0] != null){
        passage.users.forEach(function(u){
            passageUsers.push(u._id.toString());
        });
    }
    if(passage.public == true){
        var subPassages = await Passage.find({parent: passage_id}).populate('author users sourceList').sort('-stars').limit(DOCS_PER_PAGE);
    }
    else{
        var all = {
            html: passage.html || '',
            css: passage.css || '',
            javascript: passage.javascript || ''
        };
        getAllSubPassageCode(passage, all);
        if(all.html.length > 0 || all.css.length > 0 || all.javascript.length > 0){
            passage.showIframe = true;
        }
        var subPassages = await Passage.find({parent: passage_id}).populate('author users sourceList');
    }
    //reorder sub passages to match order of passage.passages
    var reordered = Array(subPassages.length).fill(0);
    for(var i = 0; i < passage.passages.length; ++i){
        for(var j = 0; j < subPassages.length; ++j){
            if(subPassages[j]._id.toString() == passage.passages[i]._id.toString()){
                reordered[i] = subPassages[j];
            }
        }
    }
    res.render("index", {subPassages: reordered, passageTitle: passage.title, passageUsers: passageUsers, Passage: Passage, scripts: scripts, sub: false, passage: passage, passages: false});
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
                    await User.updateOne({_id: user._id}, {stripeAccountId: account.id});
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
    user.recoveryToken = v4();
    await user.save();
    sendEmail(req.body.email, 'Recover Password: christianengineeringsolutions.com', 
    'https://christianengineeringsolutions.com/recoverpassword/'+user._id+'/'+user.recoveryToken);
    res.render('recover_password', {token: null});
});
app.get('/recoverpassword/:user_id/:token', async(req, res) => {
    let user = await User.findOne({_id: req.params.user_id});
    if(user.recoveryToken == req.params.token){
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
app.get('/stripeOnboarded', async (req, res, next) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    try {
        let user = await User.findOne({_id: req.session.user._id});
      // Retrieve the user's Stripe account and check if they have finished onboarding
      const account = await stripe.account.retrieve(user.stripeAccountId);
      if (account.details_submitted) {
        user.stripeOnboardingComplete = true;
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
            res.redirect('/profile/'+ user.username + '/' + user._id);
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
      req.body.name) &&
      req.body.password &&
      req.body.passwordConf && 
      req.body.password == req.body.passwordConf &&
      req.body.oldPassword) {  
        authenticateUsername(req.body.oldUsername, req.body.oldPassword, function(err, user){
            if(err){
                console.log(err);
            }
            req.session.user = user;
            user.name = req.body.name;
            user.username = req.body.newUsername;
            user.email = req.body.email;
            user.password = bcrypt.hash(req.body.password, 10, async function (err, hash){
                if (err) {
                  console.log(err);
                }
                user.password = hash;
                await user.save();
                return res.redirect('/profile/' + user._id);
            });
        });
    } 
    else{
        return res.redirect("/profile");
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
app.post('/paginate', async function(req, res){
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
            console.log(find);
        }
        if(req.body.from_ppe_queue){
            find.mimeType = 'image';
        }
        let passages = await Passage.paginate(find, {sort: '-stars', page: page, limit: DOCS_PER_PAGE, populate: 'author users'});
        console.log(find);
        if(!req.body.from_ppe_queue){
            // let test = await Passage.find({author: profile});
            // console.log(test);
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
        let users = await User.paginate(find, {sort: "-stars", page: page, limit: DOCS_PER_PAGE});
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
            sessionUser.stars -= parseInt(amount);
            let passage = await starPassage(req, amount, req.body.passage_id, sessionUser._id);
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
    //Only for private passages
    if(passage.public == false && req.session.user && req.session.user._id.toString() == passage.author.toString()){
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
    const fsp = require('fs').promises;
    await fsp.writeFile('./dist/uploads/'+uploadTitle, buf);
    let passage = await Passage.create({
        author: req.session.user,
        users: [req.session.user],
        parent: req.body.parent == 'root' ? null: req.body.parent,
        filename: uploadTitle,
        sourceList: req.body.sourceList,
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
    }).sort('-stars');
    return res.render('ppe_thumbnails', {thumbnails: passages});
});
app.get('/three', async (req, res) => {
    res.render('three');
});
async function getModels(data){
    var find = {
        mimeType: 'model',
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
    console.log(svgs);
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
    console.log("Okay");
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
                thumbnail: null
            });
            return res.send("Done");
          } else {
            return res.send("Wrong Credentials.");
          }
        })
      });
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
    passage.code = formData.code;
    passage.lang = formData.lang;
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
    //give back updated passage
    return res.render('passage', {subPassages: false, passage: passage, sub: true});
});
async function uploadFile(req, res, passage){
    console.log(req.body);
    console.log(req.files);
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    var fileToUpload = req.files.file;
    var mimeType = req.files.file.mimetype;
    //uuid with  ext
    var uploadTitle = v4() + "." + fileToUpload.name.split('.').at(-1);
    var thumbnailTitle = v4() + ".jpg";
    // Use the mv() method to place the file somewhere on your server
    fileToUpload.mv('./dist/uploads/'+uploadTitle, function(err) {
        if (err){
            return res.status(500).send(err);
        }
    });
    passage.filename = uploadTitle;
    if(mimeType.split('/')[0] == 'image'
    && mimeType.split('+')[0].split('/')[1] == 'svg'){
        passage.isSVG = true;
    }
    else{
        passage.isSVG = false;
    }
    passage.mimeType = mimeType.split('/')[0];
    if(passage.mimeType == 'model' || passage.isSVG){
        var data = req.body.thumbnail.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(data, 'base64');
        const fsp = require('fs').promises;
        await fsp.writeFile('./dist/uploads/'+thumbnailTitle, buf);
        passage.thumbnail = thumbnailTitle;
    }
    else{
        passage.thumbnail = null;
    }
    await passage.save();
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
};
//GET more extensive list
function getExt(lang){
    return extList[lang].toString();
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

app.post('/install_passage', async function(req, res){
    const fsp = require('fs').promises;
    var passage = await Passage.findOne({_id: req.body._id});
    var directory = getDirectoryStructure(passage);
    await decodeDirectoryStructure(directory);
    res.send("Done")
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
          console.log(err);
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
