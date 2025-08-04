'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const Order = require('../models/Order');
const browser = require('browser-detect');
const { scripts, DOCS_PER_PAGE, accessSecret } = require('../common-utils');
const passageService = require('../services/passageService');

async function market(req, res){
    const ISMOBILE = browser(req.headers['user-agent']).mobile;
    const page = parseInt(req.query.page || '1');
    const limit = DOCS_PER_PAGE;
    if(req.session.CESCONNECT){
        getRemotePage(req, res);
    }
    else{
        try {
            // Process each passage to get complete data
            const passages = [];
            var products = await Passage.find({label:'Product'}).populate(passageService.standardPopulate).sort('-stars').limit(DOCS_PER_PAGE);
            for (let i = 0; i < products.length; i++) {
              const processedPassage = await passageService.getPassage(products[i]);
              passages.push(processedPassage);
            }
            // Render the feed page
            return res.render("stream", {
              subPassages: false,
              passageTitle: false, 
              scripts: scripts, 
              passages: passages, 
              passage: {
                id: 'root', 
                author: {
                  _id: 'root',
                  username: 'Sasame'
                }
              },
              ISMOBILE: ISMOBILE,
              page: 'market',
              whichPage: 'market',
              thread: false
            });
      } catch (error) {
        console.error('Error generating guest feed:', error);
        return res.status(500).send('Error generating feed. Please try again later.');
      }
    }
}

async function dashboard(req, res){
    return res.render('market-dashboard');
}
async function orders(req, res){
    var orders = await Order.find({
        buyer: req.session.user._id.toString()
    }).populate('seller passage').sort('-dateSold').limit(DOCS_PER_PAGE); //show most recent first
    return res.render('orders', {orders: orders});
}
async function sales(req, res){
    var sales = await Order.find({
        seller: req.session.user._id.toString()
    }).populate('passage').sort('-dateSold').limit(DOCS_PER_PAGE); //show most recent first
    //populate fields based on chargeId
    return res.render('sales', {sales: sales});
}
async function products(req, res){
    var products = await Passage.find({
        label: 'Product',
        author: req.session.user._id.toString()
    }).populate(passageService.standardPopulate).sort('-_id').limit(DOCS_PER_PAGE);
    return res.render('products', {products: products});
}
async function buyProductLink(req, res){
    try {
        var quantity = Number(req.body.quantity);
        console.log("Quantity:"+quantity);
        var product = await Passage.findOne({_id:req.body._id});
        if(isNaN(quantity) || quantity < 1 || !Number.isInteger(quantity) || quantity > product.inStock){
            return res.send("Must enter an integer between 1 and " + product.inStock);
        }
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        var productLink = 'https://infinity-forum.org/passage/';
        if(process.env.LOCAL == 'true'){
            productLink = 'http://localhost/passage/';
        }
        productLink += product.title == '' ? 'Untitled' : encodeURIComponent(product.title) + '/' + product._id;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Specify payment methods (e.g., 'card', 'paypal')
            mode: 'payment', // 'payment' for one-time payments, 'subscription' for recurring
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: (product.price * 100), // Amount in cents
                        product_data: {
                            name: product.title,
                            description: "Product info: "+ productLink,
                            metadata: {
                                type: 'Product',
                                quantity: quantity,
                                buyerId: req.session.user._id.toString(),
                                productId: product._id.toString()
                            }
                        },
                    },
                    quantity: quantity, // Number of units of this product
                },
            ],
            success_url: req.headers.origin + '/passage/'+(product.title == '' ? 'Untitled' : encodeURIComponent(product.title))+'/'+product._id.toString(),
            cancel_url: req.headers.origin + '/donate'+(product.title == '' ? 'Untitled' : encodeURIComponent(product.title))+'/'+product._id.toString(),
            customer_email: req.session.user.email
        });
        return res.send(session.url);
    } catch (error) {
        console.error('Error creating Stripe Checkout Session:', error);
        throw error;
    }
}

async function markOrderShipped(req, res){
    var productId = req.body.productId;
    var order = await Order.findOneAndUpdate({_id:productId}, {$set:{
        shipped: true
    }});
    return res.render("order", {order: order});
}

module.exports = {
    market,
    dashboard,
    orders,
    sales,
    products,
    buyProductLink,
    markOrderShipped
};