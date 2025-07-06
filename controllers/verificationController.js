'use strict';

const { accessSecret } = require('../common-utils');
const { User } = require('../models/User');
const VerificationSession = require('../models/VerificationSession');
const verificationService = require('../services/verificationService');

// Render verify identity page
const verifyIdentity = async (req, res) => {
    if(req.session.user){
        return res.render('verify-identity', {publishableKey: process.env.STRIPE_PUBLISHABLE_KEY});
    }else{
        return res.redirect('/loginform');
    }
};

// SMS verification start handler
const smsVerifyStart = async (req, res) => {
  const { phoneNumber, channel } = req.body;
  const result = await verificationService.startVerification(phoneNumber, channel);
  res.json(result);
};

// SMS verification check handler
const smsVerifyCheck = async (req, res) => {
  const { phoneNumber, code, verificationSid } = req.body;
  var result;
  var phones = await User.find({phone:phoneNumber});
    if(phones.length > 0){
        result = {failed:true};
        return res.json(result);
    }
  result = await verificationService.checkVerification(phoneNumber, code, verificationSid);
  if(result.success){
    var user = await User.findOne({_id: req.session.user._id});
    user.phone = phoneNumber;
    await user.save();
    req.session.user.phone = phoneNumber;
  }
  return res.json(result);
};

// Create verification session handler
const createVerificationSession = async (req, res) => {
    if(req.session.user){
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
          type: 'document',
          provided_details: {
            email: req.session.user.email,
          },
          metadata: {
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
    }else{
        return res.send("Error.");
    }
};

module.exports = {
  verifyIdentity,
  createVerificationSession,
  smsVerifyStart,
  smsVerifyCheck
};