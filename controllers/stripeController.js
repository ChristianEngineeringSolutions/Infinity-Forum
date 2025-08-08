const bodyParser = require('body-parser');
const {
    User
} = require('../models/User');
const System = require('../models/System');
const Order = require('../models/Order');
const {
    Passage
} = require('../models/Passage');
const VerificationSession = require('../models/VerificationSession');
const {
    accessSecret,
    percentUSD,
    totalStarsGiven,
    monthDiff,
    percentOfPayouts
} = require('../common-utils');
const systemService = require('../services/systemService');
const paymentService = require('../services/paymentService');
const verificationService = require('../services/verificationService');

// Stripe webhook handler
const stripeWebhook = async(request, response) => {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    const endpointSecret = await accessSecret("STRIPE_ENDPOINT_SECRET_KEY");
    const payload = request.body;
    const SYSTEM = await System.findOne({});

    console.log("Got payload: " + JSON.stringify(payload));
    const sig = request.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
        console.log(event.type);
    } catch (err) {
        console.log(err);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        try {
            const session = event.data.object;
            const amount = session.amount_total;
            const customerEmail = session.customer_details?.email;
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
                expand: ['data.price.product'] // Crucial for getting product metadata
            });
            var metadata = '';
            lineItems.data.forEach(item => {
                if (item.price && item.price.product && typeof item.price.product === 'object') {
                    // Check if product data is expanded and accessible
                    const product = item.price.product;
                    if (product.metadata) {
                        metadata = product.metadata;
                    } else {
                        console.log('No metadata found for this product.');
                    }
                } else {
                    console.log('Product data not fully expanded or missing for item:', item.id);
                }
            });
            const chargeId = session.payment_intent ? await stripe.paymentIntents.retrieve(session.payment_intent).then(pi => pi.latest_charge) : null;

            if (chargeId) {
                const charge = await stripe.charges.retrieve(chargeId);
                const balanceTransactionId = charge.balance_transaction;

                if (balanceTransactionId) {
                    const balanceTransaction = await stripe.balanceTransactions.retrieve(balanceTransactionId);
                    const fee = balanceTransaction.fee;
                    const net = balanceTransaction.net;

                    var user = await User.findOne({
                        email: customerEmail
                    });
                    if (user) {
                        var amountToAdd = 0;
                        var totalStarsGivenAmount = SYSTEM.totalStarsGiven;
                        var percentUSDAmount = await percentOfPayouts(Number(amount));
                        amountToAdd = percentUSDAmount * totalStarsGivenAmount;
                        if (percentUSDAmount == 0) {
                            amountToAdd = amount / 100;
                        }
                        if (totalStarsGivenAmount == 0) {
                            amountToAdd = 10;
                        }
                        console.log("METADATA:");
                        console.log(JSON.stringify(metadata));
                        var platformDec = 0.55;
                        var userDec = 0.45;
                        if (metadata.type && metadata.type === 'Buying Donation Stars') {
                            platformDec = 0.10;
                            userDec = 0.90;
                            await User.updateOne({
                                _id: user._id.toString()
                            }, {
                                $inc: {
                                    donationStars: metadata.amount
                                }
                            });
                            await System.updateOne({
                                _id: SYSTEM._id.toString()
                            }, {
                                $inc: {
                                    platformAmount: Math.floor((amount * platformDec) - fee),
                                    userAmount: Math.floor(amount * userDec)
                                }
                            });
                        } else if (metadata.type && metadata.type === 'Product') {
                            await User.updateOne({
                                _id: user._id.toString()
                            }, {
                                $inc: {
                                    donationStars: amountToAdd
                                }
                            });
                            //create an order for the product
                            var product = await Passage.findOne({
                                _id: metadata.productId
                            });
                            await Order.create({
                                title: product.title,
                                buyer: metadata.buyerId,
                                chargeId: chargeId,
                                seller: product.author._id.toString(),
                                passage: product._id.toString(),
                                dateSold: Date.now(),
                                quantity: metadata.quantity
                            });
                            await Passage.updateOne({
                                _id: product._id.toString()
                            }, {
                                $inc: {
                                    inStock: -metadata.quantity
                                }
                            });
                            //transfer 90% of amount to seller
                            //take 25% of the 10% cut and add it to SYSTEM.userAmount
                            //add the rest to platformAmount
                            await stripe.transfers.create({
                                amount: amount * 0.90,
                                currency: "usd",
                                destination: product.author.stripeAccountId
                            });
                            var platformCommission = amount * 0.10;
                            var userPayoutAmount = platformCommission * 0.25;
                            var platformAmount = platformCommission - userPayoutAmount - fee;
                            await System.updateOne({
                                _id: SYSTEM._id.toString()
                            }, {
                                $inc: {
                                    platformAmount: Math.floor(platformAmount),
                                    userAmount: Math.floor(userPayoutAmount)
                                }
                            });
                            console.log("Order created.");
                        } else {
                            //simple donation
                            await User.updateOne({
                                _id: user._id.toString()
                            }, {
                                $inc: {
                                    donationStars: amountToAdd
                                }
                            });
                            await System.updateOne({
                                _id: SYSTEM._id.toString()
                            }, {
                                $inc: {
                                    platformAmount: Math.floor((amount * platformDec) - fee),
                                    userAmount: Math.floor(amount * userDec)
                                }
                            });
                        }
                    }
                }
            } else {
                console.log("Charge ID not found in session or payment intent.");
            }
        } catch (error) {
            console.error("Error processing checkout.session.completed:", error);
            return response.status(500).send(`Error processing event: ${error.message}`);
        }
    } else if (event.type == "invoice.paid") {
        console.log(JSON.stringify(payload.data.object.subscription));
        var email = payload.data.object.customer_email;
        const invoice = event.data.object;
        var subscriber = await User.findOne({
            email: email
        });
        var fee = 0;
        let chargeId = null;
        let paymentIntentId = null;

        if (invoice.charge) {
            chargeId = invoice.charge;
        } else if (invoice.payment_intent) {
            paymentIntentId = invoice.payment_intent;
        }

        if (chargeId) {
            try {
                const charge = await stripe.charges.retrieve(chargeId, {
                    expand: ['balance_transaction']
                });

                if (charge.balance_transaction) {
                    fee = charge.balance_transaction.fee;
                    console.log("FEE:" + fee);
                } else {
                    console.log('  Balance transaction not available on the Charge yet.');
                }
            } catch (apiErr) {
                console.error(`Error retrieving Charge ${chargeId}: ${apiErr.message}`);
            }
        } else if (paymentIntentId) {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

                if (paymentIntent.latest_charge) {
                    const charge = await stripe.charges.retrieve(paymentIntent.latest_charge, {
                        expand: ['balance_transaction']
                    });

                    if (charge.balance_transaction) {
                        fee = charge.balance_transaction.fee;
                        console.log("FEE:" + fee);
                    } else {
                        console.log('  Balance transaction not available on the Charge yet.');
                    }
                } else {
                    console.log('  No latest_charge found on PaymentIntent.');
                }
            } catch (apiErr) {
                console.error(`Error retrieving PaymentIntent ${paymentIntentId}: ${apiErr.message}`);
            }
        } else {
            console.log('  Invoice paid without an associated Charge or PaymentIntent (e.g., credit balance used).');
        }
        if (email != null && subscriber) {
            console.log(email);
            var subscriptionQuantity = 1;
            if (invoice.lines && invoice.lines.data) {
                invoice.lines.data.forEach(lineItem => {
                    if (lineItem.type === 'subscription' && lineItem.quantity) {
                        subscriptionQuantity = lineItem.quantity;
                    }
                });
            } else {
                console.log('  No line items found on this invoice.');
            }
            console.log("Subscription Quantity:" + subscriptionQuantity);
            let monthsSubscribed = monthDiff(subscriber.lastSubscribed, new Date());
            var percentPayouts = await percentOfPayouts(500 * subscriber.subscriptionQuantity * (monthsSubscribed + 1));
            var subscriptionReward = (percentPayouts) * (await totalStarsGiven());
            var totalStarsGivenAmount = await totalStarsGiven();
            if (percentPayouts == 0) {
                subscriptionReward = ((500 * subscriber.subscriptionQuantity) / 100) * (monthsSubscribed + 1);
            }
            if (totalStarsGivenAmount == 0) {
                subscriptionReward = 10;
            }
            subscriber.donationStars += subscriptionReward;
            var amount = 500 * subscriptionQuantity;
            if (!subscriber.subscribed) {
                await User.updateOne({
                    _id: subscriber._id.toString()
                }, {
                    $inc: {
                        donationStars: subscriptionReward,
                    },
                    $set: {
                        lastSubscribed: new Date(),
                        subscriptionQuantity: subscriptionQuantity,
                        subscriptionID: payload.data.object.subscription,
                        subscribed: true,
                        subscriptionPendingCancellation: false
                    }
                });
            } else {
                await User.updateOne({
                    _id: subscriber._id.toString()
                }, {
                    $inc: {
                        donationStars: subscriptionReward,
                    },
                    $set: {
                        subscriptionQuantity: subscriptionQuantity,
                        subscriptionID: payload.data.object.subscription,
                        subscribed: true,
                        subscriptionPendingCancellation: false
                    }
                });
            }
            await System.updateOne({
                _id: SYSTEM._id.toString()
            }, {
                $inc: {
                    platformAmount: Math.floor((amount * 0.55) - fee),
                    userAmount: Math.floor(amount * 0.45)
                }
            });
        }
    } else if (event.type == "invoice.payment_failed") {
        var email = payload.data.object.customer_email;
        if (email != null) {
            var subscriber = await User.findOne({
                email: email
            });
            await User.updateOne({
                _id: subscriber._id.toString()
            }, {
                $set: {
                    lastSubscribed: null,
                    subscriptionQuantity: 0,
                    subscriptionID: null,
                    subscribed: false,
                    //need to check if this makes a difference
                    //subscriptionPendingCancellation: false
                }
            });
        }
    } else if (event.type == "customer.subscription.deleted") {
        const deletedSubscription = event.data.object;
        const customerId = deletedSubscription.customer;
        if (customerId) {
            try {
                const customer = await stripe.customers.retrieve(customerId);
                const customerEmail = customer.email;
                if (customerEmail != null) {
                    var subscriber = await User.findOne({
                        email: customerEmail
                    });
                    if (subscriber && subscriber.subscriptionPendingCancellation) {
                        await User.updateOne({
                            _id: subscriber._id.toString()
                        }, {
                            $set: {
                                lastSubscribed: null,
                                subscriptionQuantity: 0,
                                subscriptionID: null,
                                subscribed: false,
                                //need to check if this makes a difference
                                //subscriptionPendingCancellation: false
                            }
                        });
                    }
                    console.log("Subscription deleted.");
                }
            } catch (apiErr) {
                console.error(`Error retrieving Customer ${customerId}: ${apiErr.message}`);
            }
        } else {
            console.log('  No customer ID found on the deleted subscription.');
        }
    } else if (event.type === 'identity.verification_session.updated' ||
        event.type === 'identity.verification_session.created' ||
        event.type === 'identity.verification_session.completed' ||
        event.type === 'identity.verification_session.verified') {

        const verificationSession = event.data.object;

        await VerificationSession.updateOne({
            stripeVerificationId: verificationSession.id
        }, {
            $set: {
                status: verificationSession.status,
                lastUpdated: new Date()
            }
        });

        if (event.type === 'identity.verification_session.verified') {
            console.log("Beginning ID verification...");
            await verificationService.processVerificationResult(verificationSession.id);
        }
    } else {
        console.log(event.type);
    }
    response.status(200).end();
};

// Stripe Connect webhook handler
const stripeConnectWebhook = async(request, response) => {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    const SYSTEM = await System.findOne({});

    const endpointSecret = await accessSecret("STRIPE_ENDPOINT_CONNECT_SECRET_KEY");
    const payload = request.body;

    console.log("Got payload: " + payload);
    const sig = request.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
        console.log(event.type);
    } catch (err) {
        console.log(err);
        return;
    }
    switch (event.type) {
        case 'account.updated':
            const updatedAccount = event.data.object;
            var user = await User.findOne({
                email: updatedAccount.email
            });
            var couldReceivePayouts = user.canReceivePayouts;
            user.canReceivePayouts = paymentService.canReceivePayouts(updatedAccount);
            if (couldReceivePayouts && !user.canReceivePayouts) {
                await System.updateOne({
                    _id: SYSTEM._id.toString()
                }, {
                    $inc: {
                        numUsersOnboarded: -1
                    }
                });
            } else if (!couldReceivePayouts && user.canReceivePayouts && user.identityVerified) {
                await System.updateOne({
                    _id: SYSTEM._id.toString()
                }, {
                    $inc: {
                        numUsersOnboarded: 1
                    }
                });
            }
            await User.updateOne({
                _id: user._id.toString()
            }, {
                $set: {
                    canReceivePayouts: paymentService.canReceivePayouts(updatedAccount)
                }
            });
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    response.status(200).end();
};

// Unsubscribe handler
const unsubscribe = async(req, res) => {
    try {
        if (req.session.user) {
            var user = await User.findOne({
                _id: req.session.user._id
            });
            if (!user.subscribed) {
                return res.send("You're not subscribed yet!");
            } else {
                const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
                const stripe = require("stripe")(STRIPE_SECRET_KEY);
                const updatedSubscription = await stripe.subscriptions.update(
                    user.subscriptionID, {
                        cancel_at_period_end: true,
                    }
                );
                user.subscriptionPendingCancellation = true;
                await user.save();
                req.session.user = user;
                return res.send("Subscription canceled.");
            }
        }
        return res.send("Done.");
    } catch (error) {
        return res.send("Error Unsubscribing. Please Contact us.");
    }
};

// Create subscription checkout handler
const createSubscriptionCheckout = async(req, res) => {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    const userId = req.session.user._id;
    const quantity = req.body.quantity;
    if (isNaN(quantity)) {
        return res.send("Please enter a valid quantity.");
    }
    try {
        if (req.session.user.subscribed) {
            console.log('ID ' + req.session.user.subscriptionID);
            return res.json({
                okay: "Currently Subscribed. Unsubscribe by updating number to 0 first! (You will not lose your monthly star multiplier if you resubscribe before your last subscription ends)"
            });
        }
        const userEmail = req.session.user.email;
        if (!userEmail) {
            return res.status(400).json({
                error: 'User email not found.'
            });
        }
        console.log(userEmail);
        let customer;
        const customerList = await stripe.customers.list({
            email: userEmail
        });

        if (customerList.data.length > 0) {
            customer = customerList.data[0];
        } else {
            customer = await stripe.customers.create({
                email: userEmail,
            });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.SUBSCRIPTION_PRICE_ID,
                quantity: quantity,
            }, ],
            success_url: `${req.headers.origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/subscription-cancel`,
        });
        console.log(session.url);
        return res.json({
            url: session.url
        });

    } catch (error) {
        console.error('Error creating checkout session:', error);
        return res.status(500).json({
            error: 'Failed to create checkout session.'
        });
    }
};


// Stripe onboarded handler
const stripeOnboarded = async(req, res, next) => {
    const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
    const stripe = require("stripe")(STRIPE_SECRET_KEY);
    try {
        let user = await User.findOne({
            _id: req.session.user._id
        });
        // Retrieve the user's Stripe account and check if they have finished onboarding
        const account = await stripe.account.retrieve(user.stripeAccountId);
        if (account.details_submitted) {
            user.stripeOnboardingComplete = true;
            user.canReceivePayouts = paymentService.canReceivePayouts(account);
            await user.save();
            const SYSTEM = await System.findOne({});
            if (user.identityVerified && user.canReceivePayouts) {
                SYSTEM.numUsersOnboarded += 1;
            }
            await SYSTEM.save();
            res.redirect('/profile');
        } else {
            console.log('The onboarding process was not completed.');
            res.redirect('/profile');
        }
    } catch (err) {
        console.log('Failed to retrieve Stripe account information.');
        console.log(err);
        next(err);
    }
};

// Stripe authorization handler
const stripeAuthorize = async(req, res) => {
    if (req.session.user) {
        // Generate a random string as `state` to protect from CSRF and include it in the session
        req.session.state = Math.random()
            .toString(36)
            .slice(2);
        var user = req.session.user;
        try {
            let accountId = user.stripeAccountId;
            let onboardingComplete = user.stripeOnboardingComplete;
            const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
            const stripe = require("stripe")(STRIPE_SECRET_KEY);
            // Create a Stripe account for this user if one does not exist already
            if (onboardingComplete === false) {
                console.log("No Account yet.");
                const account = await stripe.accounts.create({
                    type: 'express',
                    capabilities: {
                        transfers: {
                            requested: true
                        },
                    },
                    settings: {
                        payouts: {
                            schedule: {
                                interval: 'daily',
                                delay_days: 14 //every 2 weeks
                            }
                        }
                    }
                });
                try {
                    await User.updateOne({
                        _id: user._id
                    }, {
                        stripeAccountId: account.id
                    });
                } catch (error) {
                    console.error(error);
                }
                if (process.env.LOCAL) {
                    var refresh_url = 'http://localhost:3000/stripeAuthorize';
                    var return_url = 'http://localhost:3000/stripeOnboarded';
                } else {
                    var refresh_url = 'https://infinity-forum.org/stripeAuthorize';
                    var return_url = 'https://infinity-forum.org/stripeOnboarded';
                }
                // Create an account link for the user's Stripe account
                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: refresh_url,
                    return_url: return_url,
                    type: 'account_onboarding'
                });
                // Redirect to Stripe to start the Express onboarding flow
                res.redirect(accountLink.url);
            } else {
                console.log("Already has account.");
                let account = await User.findOne({
                    _id: user._id
                });
                console.log(account);
                const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId);
                res.redirect(loginLink.url);
            }
        } catch (err) {
            console.log('Failed to create a Stripe account.');
            console.log(err);
        }
    }
};

module.exports = {
    stripeWebhook,
    stripeConnectWebhook,
    unsubscribe,
    createSubscriptionCheckout,
    stripeOnboarded,
    stripeAuthorize
};