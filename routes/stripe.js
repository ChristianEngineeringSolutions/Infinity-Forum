'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const stripeController = require('../controllers/stripeController');

// Stripe payment routes

// Subscription routes
router.post('/create-subscription-checkout', stripeController.createSubscriptionCheckout);
router.post('/unsubscribe', stripeController.unsubscribe);

// Verification routes
router.post('/create-verification-session', stripeController.createVerificationSession);
router.get('/stripeOnboarded', stripeController.stripeOnboarded);

// Webhook routes (need raw body parser)
router.post('/stripe_webhook', bodyParser.raw({ type: 'application/json' }), stripeController.stripeWebhook);
router.post('/stripe_connect_webhook', bodyParser.raw({ type: 'application/json' }), stripeController.stripeConnectWebhook);

module.exports = router;