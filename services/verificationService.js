'use strict';

const crypto = require('crypto');
const VerificationSession = require('../models/VerificationSession');
const { accessSecret } = require('../common-utils');

async function createDocumentHash(documentDetails) {
  if (!documentDetails) return null;
  
  // Create a deterministic string from key document fields
  const documentString = [
    documentDetails.documentType,
    documentDetails.documentNumber,
    documentDetails.firstName,
    documentDetails.lastName,
    documentDetails.dob
  ].join('|').toLowerCase();
  
  // Use a consistent salt for all hashing
  const staticSalt = await accessSecret('DOCUMENT_VERIFICATION_SALT');
  
  return new Promise((resolve, reject) => {
    crypto.scrypt(documentString, staticSalt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

async function checkForDuplicateDocuments(documentHash, currentUserId) {
  if (!documentHash) return { isDuplicate: false, existingUserIds: [] };
  
  // Find other users who have verified with this document
  const existingVerifications = await VerificationSession
    .find({ 
      documentHash,
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
      { expand: [
      'verified_outputs.dob',
      'verified_outputs.id_number',
    ] }
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
      
      // Build document details object
      const documentDetails = verifiedOutputs ? {
        documentType: verifiedOutputs.id_number_type || null,  // e.g., 'us_ssn', 'driving_license'
        documentNumber: verifiedOutputs.id_number || null,
        firstName: verifiedOutputs.first_name || null,
        lastName: verifiedOutputs.last_name || null,
        dob: dob,
        // Address fields if available
        address: verifiedOutputs.address ? {
          line1: verifiedOutputs.address.line1,
          line2: verifiedOutputs.address.line2,
          city: verifiedOutputs.address.city,
          state: verifiedOutputs.address.state,
          postalCode: verifiedOutputs.address.postal_code,
          country: verifiedOutputs.address.country
        } : null
      } : null;
      
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
      
      // Only create hash and check duplicates if we have document details
      if (documentDetails && documentDetails.documentNumber) {
        // Create a unique identifier based on document details
        const documentHash = await createDocumentHash(documentDetails);
        
        await VerificationSession.updateOne({
          userId: internalRecord.userId
        }, {
          $set: {
            documentHash: documentHash,
            documentType: documentDetails.documentType,
            verifiedAt: new Date(),
            status: 'verified'
          }
        });
        console.log("Saved document hash.");
        
        // Check for duplicate documents across users
        const duplicateResults = await checkForDuplicateDocuments(documentHash, internalRecord.userId);
        
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
  createDocumentHash,
  checkForDuplicateDocuments,
  initializeTwilio,
  startVerification,
  checkVerification,
  processVerificationResult
};