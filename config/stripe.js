'use strict';

const { accessSecret } = require('../common-utils');

// Stripe configuration

async function initializeStripe() {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    return stripe;
}

async function getStripeConfig() {
    return {
        secretKey: await accessSecret("STRIPE_SECRET_KEY"),
        publishableKey: await accessSecret("STRIPE_PUBLISHABLE_KEY"),
        webhookSecret: await accessSecret("STRIPE_WEBHOOK_SECRET"),
        connectWebhookSecret: await accessSecret("STRIPE_CONNECT_WEBHOOK_SECRET")
    };
}

module.exports = {
    initializeStripe,
    getStripeConfig
};