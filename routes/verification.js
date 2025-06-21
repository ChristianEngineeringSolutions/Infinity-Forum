'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const verificationController = require('../controllers/verificationController');

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
  message: 'Too many verification attempts from this IP, please try again after a minute.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Route to initiate verification
router.post('/smsverify/start', requestVerificationLimiter, async (req, res) => {
  const { phoneNumber, channel } = req.body;
  const result = await verificationController.startVerification(phoneNumber, channel);
  res.json(result);
});

// Route to check the verification code
router.post('/smsverify/check', submitVerificationLimiter, async (req, res) => {
  const { User } = require('../models/User');
  const { phoneNumber, code, verificationSid } = req.body;
  var result;
  var phones = await User.find({phone:phoneNumber});
    if(phones.length > 0){
        result = {failed:true};
        return res.json(result);
    }
  result = await verificationController.checkVerification(phoneNumber, code, verificationSid);
  if(result.success){
    var user = await User.findOne({_id: req.session.user._id});
    user.phone = phoneNumber;
    await user.save();
    req.session.user.phone = phoneNumber;
  }
  return res.json(result);
});

// Route for creating verification session
router.post('/create-verification-session', async(req, res) => {
    const { accessSecret } = require('../common-utils');
    const { VerificationSession } = require('../models/VerificationSession');
    
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

        // Return only the client secret to the frontend.
        // const clientSecret = verificationSession.client_secret;
        // return res.status(200).json({ clientSecret: clientSecret });
    }else{
        return res.send("Error.");
    }
});

module.exports = router;