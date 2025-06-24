'use strict';

const { accessSecret } = require('../common-utils');
const { User } = require('../models/User');
const System = require('../models/System');
const VerificationSession = require('../models/VerificationSession');
const { createDocumentHash, checkForDuplicateDocuments } = require('../services/verificationService');
const { canReceivePayouts } = require('../services/paymentService');

// These will be initialized when the controller is required
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

async function processVerificationResult(verificationSessionId) {
  try {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    const SYSTEM = await System.findOne({});
    // Retrieve the verification details from Stripe
    const verificationSession = await stripe.identity.verificationSessions.retrieve(
      verificationSessionId, 
      { expand: ['verified_outputs'] }
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
      // Get document details (available in verified_outputs)
      const documentDetails = verificationSession.verified_outputs?.document?.dob ?
        {
          documentType: verificationSession.verified_outputs.document.type,
          documentNumber: verificationSession.verified_outputs.document.number,
          firstName: verificationSession.verified_outputs.document.first_name,
          lastName: verificationSession.verified_outputs.document.last_name,
          dob: verificationSession.verified_outputs.document.dob.day + 
               '/' + verificationSession.verified_outputs.document.dob.month +
               '/' + verificationSession.verified_outputs.document.dob.year,
          expiryDate: verificationSession.verified_outputs.document.expiration_date ?
            verificationSession.verified_outputs.document.expiration_date.day +
            '/' + verificationSession.verified_outputs.document.expiration_date.month +
            '/' + verificationSession.verified_outputs.document.expiration_date.year : null
        } : null;
      
      // Create a unique identifier based on document details
      const documentHash = await createDocumentHash(documentDetails);
      
      await VerificationSession.updateOne({
        userId: internalRecord.userId
      }, {$set: {
        documentHash: documentHash,
        documentType: documentDetails?.documentType,
        verifiedAt: new Date(),
        status: 'verified'
      }});
      console.log("Saved document hash.");
      // Check for duplicate documents across users
      const duplicateResults = await checkForDuplicateDocuments(documentHash, internalRecord.userId);
      
      if (duplicateResults.isDuplicate) {
        // Flag accounts for review
        // await flagDuplicateAccounts(internalRecord.userId, duplicateResults.existingUserIds);
        
        // Update session with duplicate info
        await VerificationSession.updateOne(
          { stripeVerificationId: verificationSessionId },
          { $set: { duplicateDetected: true } }
        );
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
        var user = await User.findOne({_id: internalRecord.userId});
        user.stars += 100;
        if(user.stripeOnboardingComplete && user.stripeAccountId){
            const account = await stripe.account.retrieve(user.stripeAccountId);
            user.canReceivePayouts = canReceivePayouts(account);
            if(user.canReceivePayouts){
                SYSTEM.numUsersOnboarded += 1;
                await SYSTEM.save();
            }
        }
        await user.save();

      }
    }
  } catch (error) {
    console.error('Error processing verification result:', error);
  }
}

module.exports = {
  startVerification,
  checkVerification,
  processVerificationResult
};