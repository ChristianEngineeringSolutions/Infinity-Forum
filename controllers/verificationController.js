'use strict';

const { accessSecret } = require('../common-utils');
const { User } = require('../models/User');
const VerificationSession = require('../models/VerificationSession');
const verificationService = require('../services/verificationService');
const systemService = require('../services/systemService');

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

// Render verify address page
const verifyAddress = async (req, res) => {
    if(req.session.user){
        return res.render('verify-address', {user: req.session.user});
    }else{
        return res.redirect('/loginform');
    }
};

// Render verify TIN page
const verifyTIN = async (req, res) => {
    if(req.session.user){
        return res.render('verify-tin', {user: req.session.user});
    }else{
        return res.redirect('/loginform');
    }
};

// Render verify email page
const verifyEmail = async (req, res) => {
    if(req.session.user){
        return res.render('verify-email', {user: req.session.user});
    }else{
        return res.redirect('/loginform');
    }
};

// Create address verification session with Veriff
const createAddressVerificationSession = async (req, res) => {
    if(!req.session.user){
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    
    const { firstName, lastName, country, address, city, state, postalCode } = req.body;
    
    if (!firstName || !lastName || !country || !address) {
        return res.status(400).json({ success: false, message: "First name, last name, country, and address are required" });
    }
    
    try {
        const VERIFF_API_KEY = await accessSecret("VERIFF_API_KEY");
        const VERIFF_BASE_URL = process.env.VERIFF_BASE_URL || 'https://stationapi.veriff.com';
        
        // Create verification session with Veriff API using form data
        const verificationData = {
            verification: {
                callback: `${process.env.BASE_URL}/veriff-address-webhook`,
                person: {
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                },
                address: {
                    fullAddress: address.trim(),
                    city: city?.trim(),
                    state: state?.trim(),
                    postalCode: postalCode?.trim(),
                    country: country.trim()
                },
                document: {
                    type: 'PROOF_OF_RESIDENCE',
                    country: country.trim()
                },
                additionalData: {
                    userId: req.session.user._id.toString()
                }
            }
        };
        
        const response = await fetch(`${VERIFF_BASE_URL}/v1/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AUTH-CLIENT': VERIFF_API_KEY
            },
            body: JSON.stringify(verificationData)
        });
        
        const sessionData = await response.json();
        
        if (response.ok && sessionData.status === 'success') {
            return res.json({
                success: true,
                sessionUrl: sessionData.verification.url,
                sessionToken: sessionData.verification.sessionToken
            });
        } else {
            return res.status(400).json({ success: false, message: sessionData.reason || 'Failed to create verification session' });
        }
    } catch (error) {
        console.error('Error creating address verification session:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Create TIN verification session with TINCheck
const createTINVerificationSession = async (req, res) => {
    if(!req.session.user){
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    
    const { tin, tinType, firstName, lastName } = req.body;
    
    if (!tin || !tinType || !firstName || !lastName) {
        return res.status(400).json({ success: false, message: "TIN, TIN type, first name, and last name are required" });
    }
    
    try {
        const TINCHECK_API_KEY = await accessSecret("TINCHECK_API_KEY");
        const TINCHECK_BASE_URL = process.env.TINCHECK_BASE_URL || 'https://api.tincheck.com';
        
        // Verify TIN with TINCheck API using form data
        const verificationData = {
            tin: tin.trim(),
            tin_type: tinType, // 'EIN', 'SSN', 'ITIN', etc.
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            user_id: req.session.user._id.toString()
        };
        
        const response = await fetch(`${TINCHECK_BASE_URL}/v1/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TINCHECK_API_KEY}`
            },
            body: JSON.stringify(verificationData)
        });
        
        const verificationResult = await response.json();
        
        if (response.ok && verificationResult.valid) {
            // Update user's TIN verification status
            await User.findByIdAndUpdate(req.session.user._id, {
                verifiedTaxIdentificationNumber: true,
                verifiedTINValue: tin.trim()
            });
            
            // Update session
            req.session.user.verifiedTaxIdentificationNumber = true;
            req.session.user.verifiedTINValue = tin.trim();
            
            return res.json({
                success: true,
                message: 'TIN verification successful',
                verified: true
            });
        } else {
            return res.json({
                success: false,
                message: verificationResult.message || 'TIN verification failed',
                verified: false
            });
        }
    } catch (error) {
        console.error('Error verifying TIN:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Resend verification email
const resendVerificationEmail = async (req, res) => {
    if(!req.session.user){
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    
    try {
        const user = await User.findById(req.session.user._id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        if (user.verified) {
            return res.json({ success: false, message: "Email is already verified" });
        }
        
        // Send verification email using existing logic from authController
        await systemService.sendEmail(user.email, 'Verify Email for Infinity Forum.', 
            `Please click the following link to verify your email:
            
            https://infinity-forum.org/verify/${user._id}/${user.token}
            
            This link will verify your email address and activate your account.
            `);
        
        return res.json({
            success: true,
            message: 'Verification email sent successfully'
        });
    } catch (error) {
        console.error('Error sending verification email:', error);
        return res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }
};

module.exports = {
  verifyIdentity,
  createVerificationSession,
  smsVerifyStart,
  smsVerifyCheck,
  verifyAddress,
  verifyTIN,
  verifyEmail,
  createAddressVerificationSession,
  createTINVerificationSession,
  resendVerificationEmail
};