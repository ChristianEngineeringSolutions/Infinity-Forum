'use strict';

const express = require('express');
const router = express.Router();
const {requiresAdmin} = require('../middleware/auth.js'); 
const adminController = require('../controllers/adminController');

// File management routes
router.post('/run_file', requiresAdmin, adminController.runFile);
router.post('/makeMainFile', requiresAdmin, adminController.makeMainFile);
router.post('/removeFile', requiresAdmin, adminController.removeFile);
router.post('/update_file', requiresAdmin, adminController.updateFile);
router.post('/updateFileStream', requiresAdmin, adminController.updateFileStream);
router.post('/syncfilestream', requiresAdmin, adminController.syncFileStreamController);

// System evaluation
router.post('/server_eval', requiresAdmin, adminController.serverEval);

// API admin routes
router.post('/api/admin/clear-all-feed-caches', requiresAdmin, adminController.clearAllFeedCaches);
router.post('/api/admin/invalidate-feed-cache', requiresAdmin, adminController.invalidateFeedCache);

// Admin backup/restore routes
router.get('/dbbackup.zip', requiresAdmin, adminController.dbBackupZip);
router.get('/uploadsbackup.zip', requiresAdmin, adminController.uploadsBackupZip);
router.get('/protectedbackup.zip', requiresAdmin, adminController.protectedBackupZip);
router.post('/restoredatabase', requiresAdmin, adminController.restoreDatabase);
router.post('/restoreuploads', requiresAdmin, adminController.restoreUploads);
router.post('/restoreprotected', requiresAdmin, adminController.restoreProtected);

// Admin panel routes
router.get('/admin/:focus?/', requiresAdmin, adminController.getAdmin);

// Route to trigger the GCS upload process
router.get('/upload-to-gcs', requiresAdmin, adminController.uploadToGcs);

module.exports = router;