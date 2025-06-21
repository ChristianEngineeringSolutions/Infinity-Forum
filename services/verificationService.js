'use strict';

const crypto = require('crypto');
const { VerificationSession } = require('../models/VerificationSession');
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
    })
    .toArray();
  
  const existingUserIds = existingVerifications.map(v => v.userId);
  
  return {
    isDuplicate: existingUserIds.length > 0,
    existingUserIds
  };
}

module.exports = {
  createDocumentHash,
  checkForDuplicateDocuments
};