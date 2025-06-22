'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();

// Static file serving routes

router.get('/jquery.min.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery/dist/jquery.min.js'));
});
router.get('/jquery-ui.min.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery-ui-dist/jquery-ui.min.js'));
});
router.get('/jquery-ui.css', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery-ui-dist/jquery-ui.css'));
});
router.get('/jquery.modal.min.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery-modal/jquery.modal.min.js'));
});
router.get('/jquery.modal.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery-modal/jquery.modal.js'));
});
router.get('/jquery.modal.min.css', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/jquery-modal/jquery.modal.min.css'));
});
router.get('/data.json', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../data.json'));
});
router.get('/ionicons.esm.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/ionicons/ionicons.esm.js'));
});
router.get('/ionicons.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/ionicons/ionicons.js'));
});
router.get('/p-9c97a69a.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/ionicons/p-9c97a69a.js'));
});
router.get('/p-c1aa32dd.entry.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/ionicons/p-c1aa32dd.entry.js'));
});
router.get('/p-85f22907.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/ionicons/p-85f22907.js'));
});
router.get('/quill.snow.css', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/quill/dist/quill.snow.css'));
});
router.get('/quill.min.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/quill/dist/quill.min.js'));
});
router.get('/highlight.css', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/highlight.js/styles/a11y-light.css'));
});
router.get('/highlight.js', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/highlight.js/lib/index.js'));
});
router.get('/caret-down.svg', function(req, res) {
    res.sendFile(path.resolve(__dirname, '../node_modules/ionicons/dist/svg/caret-down.svg'));
});

module.exports = router;