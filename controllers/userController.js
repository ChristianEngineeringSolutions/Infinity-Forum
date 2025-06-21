'use strict';

const { User } = require('../models/User');
const nodemailer = require('nodemailer');
const { accessSecret } = require('../common-utils');

// Helper function to check if user exists
async function userExists(email) {
    const user = await User.findOne({ email: email });
    return user !== null;
}

// Send email function (from sasame.js line 8500)
async function sendEmail(to, subject, body){
    const EMAIL_PASSWORD = await accessSecret("EMAIL_PASSWORD");
    var transporter = nodemailer.createTransporter({
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

module.exports = {
    userExists,
    sendEmail
};