'use strict';

const express = require('express');
const router = express.Router();

// Static file serving routes

// jQuery files
router.get('/jquery.min.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery.min.js');
});

router.get('/jquery-ui.min.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery-ui.min.js');
});

router.get('/jquery-ui.css', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery-ui.css');
});

router.get('/jquery.modal.min.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery.modal.min.js');
});

router.get('/jquery.modal.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery.modal.js');
});

router.get('/jquery.modal.min.css', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('jquery.modal.min.css');
});

// Data files
router.get('/data.json', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('data.json');
});

// Ionicons files
router.get('/ionicons.esm.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('ionicons.esm.js');
});

router.get('/ionicons.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('ionicons.js');
});

// Other static files
router.get('/p-9c97a69a.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('p-9c97a69a.js');
});

router.get('/p-c1aa32dd.entry.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('p-c1aa32dd.entry.js');
});

router.get('/p-85f22907.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('p-85f22907.js');
});

// Quill editor files
router.get('/quill.snow.css', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('quill.snow.css');
});

router.get('/quill.min.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('quill.min.js');
});

// Highlight.js files
router.get('/highlight.css', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('highlight.css');
});

router.get('/highlight.js', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.sendFile('highlight.js');
});

// Under construction route
router.get('/under-construction', function(req, res) {
  // This route logic will be moved from sasame.js
  // Placeholder for now
  res.render('construction');
});

module.exports = router;