'use strict';

const bcrypt = require('bcrypt');
const { v4 } = require('uuid');
const { User } = require('../models/User');
const { scripts, accessSecret } = require('../common-utils');
const { promisify } = require('util');
const request = promisify(require('request'));
const userService = require('../services/userService');
const systemService = require('../services/systemService');

// Render login form (from sasame.js line 654)
async function renderLoginForm(req, res) {
    res.render('login_register', {scripts: scripts});
}

// Handle login (from sasame.js line 4945)
async function handleLogin(req, res) {
    //check if email has been verified
    var user = await userService.authenticateUsername(req.body.username, req.body.password);
    var proceed = (!user.simulated && process.env.REMOTE === 'true') || process.env.LOCAL === 'true';
    if(user && proceed){
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

async function handleRegister(req, res) {    
    console.log("Handling register");
    if (req.body.email &&
      req.body.name &&
      req.body.hiddenUsername &&
      req.body.password &&
      req.body.passwordConf && 
      req.body.password == req.body.passwordConf
      && req.body["g-recaptcha-response"]
      && !(await userService.userExists(req.body.email))) {  

        var fake = req.body.fake || false;
        console.log("TESTING TESTING TESTING");

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
        let ipNumber = req.clientIp.split('.').map(Number).reduce((a, b) => (a << 8) + b, 0);
        var lastLogin = new Date();
        var userData = {
        name: req.body.name,
        username: req.body.hiddenUsername,
        password: req.body.password,
        stars: 0,
        token: v4(),
        lastLogin: lastLogin,
        joined: lastLogin,
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
      console.log("Before user created");
      User.create(userData, async function (err, user) {
        console.log("User created");
        if (err) {
          console.log(err);
        } else {
            if(!fake){
                req.session.user = user;
            }
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
            await systemService.sendEmail(user.email, 'Verify Email for Infinity Forum.', 
                `
                    https://infinity-forum.org/verify/`+user._id+`/`+user.token+`
                `);
          }
          if(fake){
            console.log("ALL DONE WITH FAKE");
            return res.send('Done.');
          }
          res.redirect('/profile/');
        }
      });
    }
    else{
        if(!req.body.email ||
      !req.body.name ||
      !req.body.hiddenUsername ||
      !req.body.password ||
      !req.body.passwordConf){
            var str = JSON.stringify({
                email: req.body.email,
                name: req.body.name,
                hiddenUsername: req.body.hiddenUsername,
                password: req.body.password,
                passwordConf: req.body.passwordConf
            });
            str = '';
            res.send('Missing field.' + str);
        }else if(req.body.password !== req.body.passwordConf){
            res.send("Passwords don't match.")
        }else if(!req.body["g-recaptcha-response"]){
            res.send("Missign RECAPTCHA");
        }else if ((await userService.userExists(req.body.email))){
            res.send("Email already exists. Try recovering password.");
        }else{
            console.log(req.body.hiddenUsername + ' test');
            res.send("Mysterious issue.");
        }
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
        await systemService.sendEmail(req.body.email, 'Recover Password: Infinity-Forum.org', 
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