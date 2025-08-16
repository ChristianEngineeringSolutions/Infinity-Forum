'use strict';

const crypto = require('crypto');
const VerificationSession = require('../models/VerificationSession');
const { accessSecret } = require('../common-utils');

async function checkForDuplicateIdentities(verificationReportId, currentUserId) {
  if (!verificationReportId) return { isDuplicate: false, existingUserIds: [] };
  
  // Find other users who have verified with this document
  const existingVerifications = await VerificationSession
    .find({ 
      verificationReportId,
      userId: { $ne: currentUserId } // Exclude current user
    });
  
  const existingUserIds = existingVerifications.map(v => v.userId);
  
  return {
    isDuplicate: existingUserIds.length > 0,
    existingUserIds
  };
}

// Twilio client variables
let client, serviceSid;

// Initialize Twilio client and service SID
async function initializeTwilio() {
    if (!client) {
        const twilio = require('twilio');
        const accountSid = await accessSecret('TWILIO_ACCOUNT_SID');
        const authToken = await accessSecret('TWILIO_AUTH_TOKEN');
        serviceSid = await accessSecret('TWILIO_VERIFY_SERVICE_SID');
        client = twilio(accountSid, authToken);
    }
}

// Start SMS verification
async function startVerification(phoneNumber, channel = 'sms') {
  await initializeTwilio();
  try {
    const verification = await client.verify.v2.services(serviceSid)
      .verifications
      .create({
        to: phoneNumber,
        channel: channel, // 'sms' or 'call'
      });
    console.log('Verification initiated:', verification.sid);
    return { success: true, verificationSid: verification.sid };
  } catch (error) {
    console.error('Error initiating verification:', error);
    return { success: false, error: error.message };
  }
}

// Check SMS verification code
async function checkVerification(phoneNumber, code, verificationSid) {
  await initializeTwilio();
  try {
    const verificationCheck = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({
        to: phoneNumber,
        code: code,
        verificationSid: verificationSid // Optional, but recommended for security
      });
    console.log('Verification check status:', verificationCheck.status);
    return { success: verificationCheck.status === 'approved', status: verificationCheck.status };
  } catch (error) {
    console.error('Error checking verification:', error);
    return { success: false, error: error.message };
  }
}

// Process verification result from Stripe
async function processVerificationResult(verificationSessionId) {
  const { User } = require('../models/User');
  const System = require('../models/System');
  const { canReceivePayouts } = require('./paymentService');
  
  try {
    const STRIPE_IDENTITY_VERIFICATION_SECRET_KEY = await accessSecret("STRIPE_IDENTITY_VERIFICATION_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_IDENTITY_VERIFICATION_SECRET_KEY);
    const SYSTEM = await System.findOne({});
    
    // Retrieve the verification details from Stripe
    const verificationSession = await stripe.identity.verificationSessions.retrieve(
      verificationSessionId, 
      { expand: ['last_verification_report'] }
    );
    
    // Find our internal record for this verification
    const internalRecord = await VerificationSession
      .findOne({ stripeVerificationId: verificationSessionId });
    
    if (!internalRecord) {
      console.error('Verification record not found for session:', verificationSessionId);
      return;
    }
    
    // If verification was successful
    if (verificationSession.status === 'verified') {
      // Log the structure to debug
      console.log('Full verification session:', JSON.stringify(verificationSession, null, 2));
      console.log('Verified outputs:', JSON.stringify(verificationSession.verified_outputs, null, 2));
      
      // Access the correct fields from verified_outputs
      const verifiedOutputs = verificationSession.verified_outputs;
      
      // Build DOB string if available
      const dob = verifiedOutputs?.dob ? 
        `${verifiedOutputs.dob.day}/${verifiedOutputs.dob.month}/${verifiedOutputs.dob.year}` : 
        null;

      // Update user with verified information
      if (verifiedOutputs) {
        await User.updateOne({
          _id: internalRecord.userId.toString()
        }, {
          $set: {
            verifiedfirstName: verifiedOutputs.first_name || null,
            verifiedlastName: verifiedOutputs.last_name || null,
            verifiedDOB: dob
          }
        });
      }
      if (verificationSession.last_verification_report && typeof verificationSession.last_verification_report === 'object') {
        await VerificationSession.updateOne({
          userId: internalRecord.userId
        }, {
          $set: {
            verifiedAt: new Date(),
            status: 'verified',
            verificationReportId: verificationSession.last_verification_report.id
          }
        });
        console.log("Saved unique identifier.");
        
        // Check for duplicate documents across users
        const duplicateResults = await checkForDuplicateIdentities(verificationSession.last_verification_report.id, internalRecord.userId);
        
        if (duplicateResults.isDuplicate) {
          // Update session with duplicate info
          await VerificationSession.updateOne(
            { stripeVerificationId: verificationSessionId },
            { $set: { duplicateDetected: true } }
          );
          console.log("Duplicate detected.");
        } else {
          // Update user's verification status
          await User.updateOne(
            { _id: internalRecord.userId },
            { 
              $set: { 
                identityVerified: true,
                verificationLevel: 'full',
                lastVerifiedAt: new Date()
              } 
            }
          );
          console.log("Identity Verified set to true.");
          
          const user = await User.findOne({_id: internalRecord.userId});
          await User.updateOne({_id:internalRecord.userId}, {$inc: {
              stars: 100
            }});
          
          if(user.stripeOnboardingComplete && user.stripeAccountId){
            const account = await stripe.account.retrieve(user.stripeAccountId);
            user.canReceivePayouts = canReceivePayouts(account);
            await User.updateOne({_id:internalRecord.userId}, {$set: {
              canReceivePayouts: canReceivePayouts(account)
            }});
            if(user.canReceivePayouts){
              await System.updateOne({_id:SYSTEM._id.toString()}, {$inc:{
                numUsersOnboarded: 1
              }});
              await SYSTEM.save();
            }
          }
        }
      } else {
        console.warn('No document details available in verified outputs');
      }
    }
  } catch (error) {
    console.error('Error processing verification result:', error);
    // Log more details for debugging
    console.error('Error stack:', error.stack);
  }
}

module.exports = {
  checkForDuplicateIdentities,
  initializeTwilio,
  startVerification,
  checkVerification,
  processVerificationResult
};