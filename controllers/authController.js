'use strict';

const bcrypt = require('bcrypt');
const { v4 } = require('uuid');
const { User } = require('../models/User');
const { scripts, accessSecret } = require('../common-utils');
const { promisify } = require('util');
const request = promisify(require('request'));

const { userExists } = require('../services/userService');
const { sendEmail } = require('../services/systemService');

// Authentication helper function (from sasame.js line 8461)
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

// Render login form (from sasame.js line 654)
async function renderLoginForm(req, res) {
    res.render('login_register', {scripts: scripts});
}

// Handle login (from sasame.js line 4945)
async function handleLogin(req, res) {
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
}

// Handle registration (from sasame.js line 5991)
async function handleRegister(req, res) {
    // Import userExists when userController is created
    const { userExists, sendEmail } = require('./userController');
    
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
}

// Handle logout (from sasame.js line 6115)
async function handleLogout(req, res) {
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
}

// Render password recovery form (from sasame.js line 4871)
async function renderRecover(req, res) {
    res.render('recover');
}

// Handle password recovery request (from sasame.js line 4874)
async function handleRecover(req, res) {
    const { sendEmail } = require('./userController');
    
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
}

// Render password recovery form with token (from sasame.js line 4890)
async function renderRecoverPassword(req, res) {
    let user = await User.findOne({_id: req.params.user_id});
    if(user && user.recoveryToken == req.params.token && (Date.now() < user.recoveryExp)){
        res.render("recover_password", {token: req.params.token, _id: user._id});
    }
    else{
        res.redirect('/');
    }
}

// Handle password reset (from sasame.js line 4899)
async function handleRecoverPassword(req, res) {
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
}

// Handle email verification (from sasame.js line 7923)
async function handleEmailVerification(req, res) {
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
}

// Render identity verification (from sasame.js line 4654)
async function renderVerifyIdentity(req, res) {
    if(req.session.user){
        return res.render('verify-identity', {publishableKey: process.env.STRIPE_PUBLISHABLE_KEY});
    }else{
        return res.redirect('/loginform');
    }
}

// Middleware functions

// Requires login middleware (from sasame.js line 8484)
async function requiresLogin(req, res, next){
    if(req.session.user){
        next();
    }
    else{
        return res.redirect('/loginform');
    }
}

// Requires admin middleware (from sasame.js line 8492)
async function requiresAdmin(req, res, next){
    if(req.session.user && req.session.user.admin){
        next();
    }
    else{
        return res.send('Requires Admin.');
    }
}

module.exports = {
    authenticateUsername,
    renderLoginForm,
    handleLogin,
    handleRegister,
    handleLogout,
    renderRecover,
    handleRecover,
    renderRecoverPassword,
    handleRecoverPassword,
    handleEmailVerification,
    renderVerifyIdentity,
    requiresLogin,
    requiresAdmin
};