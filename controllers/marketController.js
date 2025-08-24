'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const Order = require('../models/Order');
const browser = require('browser-detect');
const { scripts, DOCS_PER_PAGE, accessSecret } = require('../common-utils');
const passageService = require('../services/passageService');
const mongoose = require('mongoose');
const systemService = require('../services/systemService');

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
            // Check if user can create products
            let canCreateProducts = false;
            if (req.session.user) {
              canCreateProducts = await scripts.canCreateProducts(req.session.user);
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
              thread: false,
              canCreateProducts: canCreateProducts
            });
      } catch (error) {
        console.error('Error generating guest feed:', error);
        return res.status(500).send('Error generating feed. Please try again later.');
      }
    }
}

async function dashboard(req, res){
    var page = req.query.page || req.params.page || 1;
    var find = {
        author:req.session.user._id.toString(), 
        label:'Product'
    };
    if(req.params.search){
        find.title = {$regex: req.params.search, $options:'i'}
    }
    console.log(JSON.stringify(find));
    var totalDocuments = await Passage.countDocuments(find);
    var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    var products = await Passage.paginate(find, {sort: '-_id', page: page, limit: DOCS_PER_PAGE, populate: passageService.standardPopulate});
    const passages = [];
    for (const product of products.docs) {
      const processedPassage = await passageService.getPassage(product);
      passages.push(processedPassage);
    }
    return res.render('market-dashboard', {passages:passages, subPassages:false, page: page, totalPages: totalPages});
}
async function orders(req, res){
    var page = req.query.page || req.params.page || 1;
    var find = {
        buyer: req.session.user._id.toString()
    };
    if(req.params.search){
        find.title = {$regex: req.params.search, $options:'i'}
    }
    var totalDocuments = await Order.countDocuments(find);
    var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    var orders = await Order.paginate(find, {
        sort: '-dateSold', page:page, 
        limit:DOCS_PER_PAGE, 
        populate:'seller passage'
    }); //show most recent first
    return res.render('orders', {orders: orders.docs, page: page, totalPages: totalPages});
}
async function order(req, res){
    var order = await Order.findOne({_id: req.params.id}).populate('seller passage');
    if(req.session.user._id.toString() !== order.buyer._id.toString()){
        return res.send("Order does not exist.");
    }
    return res.render('order-page', {order: order, seller: true, page: 'more'});
}
async function sale(req, res){
    var sale = await Order.findOne({_id: req.params.id}).populate('buyer passage');
    if(req.session.user._id.toString() !== sale.seller._id.toString()){
        return res.send("Sale does not exist.");
    }
    return res.render('order-page', {order: sale, seller: false, page: 'more'});
}
async function sales(req, res){
    var page = req.query.page || req.params.page || 1;
    var find = {
        seller: req.session.user._id.toString()
    };
    var search = req.params.search;
    var shipped = req.query.shipped;
    if(shipped && shipped !== 'both'){
        find.shipped = shipped == 'true' ? true : false;
    }
    if(search){
        if(mongoose.isValidObjectId(search)){
            find._id = search;
        }else{
            find.title = {$regex: search, $options:'i'}
        }
    }
    var totalDocuments = await Order.countDocuments(find);
    var totalPages = Math.floor(totalDocuments/DOCS_PER_PAGE) + 1;
    var sales = await Order.paginate(find, {
        sort: '-dateSold', page:page, 
        limit:DOCS_PER_PAGE, 
        populate:'buyer passage'
    });
    //populate fields based on chargeId
    return res.render('sales', {orders: sales.docs, page: page, totalPages: totalPages});
}
async function buyProductLink(req, res){
    if(!req.session.user){
        return res.send(process.env.DOMAIN + '/loginform');
    }
    try {
        var quantity = Number(req.body.quantity);
        console.log("Quantity:"+quantity);
        var product = await Passage.findOne({_id:req.body._id}).populate('author');
        if(product.inStock < 1){
            return res.send("Product out of Stock.");
        }
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
        // Calculate the total amount in cents
        const totalAmountInCents = (product.price * 100) * quantity;
        // Calculate the 10% application fee in cents, rounding to the nearest whole number
        // This fee is charged to the platform, and the rest goes to the connected account
        const applicationFeeAmount = Math.round(totalAmountInCents * 0.10);
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
            shipping_address_collection: {
                allowed_countries: ['US', 'CA'], // Example: Allow US and Canada
            },
            success_url: req.headers.origin + '/passage/'+(product.title == '' ? 'Untitled' : encodeURIComponent(product.title))+'/'+product._id.toString(),
            cancel_url: req.headers.origin + '/donate'+(product.title == '' ? 'Untitled' : encodeURIComponent(product.title))+'/'+product._id.toString(),
            customer_email: req.session.user.email,
            payment_intent_data: {
                application_fee_amount: applicationFeeAmount,
                metadata: {
                    productId: product._id.toString(),
                    productName: product.title, // Add this line
                    productDescription: "Product info: " + productLink, // Add this line
                    productQuantity: quantity // Add this line
                }
            }
        }, {
            stripeAccount: product.author.stripeAccountId
        });
        return res.send(session.url);
    } catch (error) {
        console.error('Error creating Stripe Checkout Session:', error);
        throw error;
    }
}

async function manageProducts(req, res){
    if(!req.session.user){
        return res.redirect('/loginform');
    }
    
    if(!req.session.user.stripeAccountId){
        return res.send('You need a Stripe account to manage products.');
    }
    
    try {
        const ISMOBILE = browser(req.headers['user-agent']).mobile;
        const STRIPE_SECRET_KEY = await accessSecret("STRIPE_SECRET_KEY");
        const stripe = require("stripe")(STRIPE_SECRET_KEY);
        
        const page = parseInt(req.query.page || '1');
        const limit = 10; // Items per page
        const startingAfter = req.query.starting_after;
        const endingBefore = req.query.ending_before;
        
        // Build pagination parameters
        const paginationParams = { limit: 100 }; // Get more to process locally
        if (startingAfter) paginationParams.starting_after = startingAfter;
        if (endingBefore) paginationParams.ending_before = endingBefore;
        
        // Get all payment intents for this connected account to find sold products
        const paymentIntents = await stripe.paymentIntents.list(paginationParams, {
            stripeAccount: req.session.user.stripeAccountId
        });
        
        // Get unique products from payment intent metadata with shipping details
        const productSales = new Map();
        
        for (const intent of paymentIntents.data) {
            if (intent.status === 'succeeded' && intent.metadata.productId) {
                const productId = intent.metadata.productId;
                
                if (!productSales.has(productId)) {
                    productSales.set(productId, {
                        productId: productId,
                        sales: [],
                        totalSales: 0,
                        totalRevenue: 0
                    });
                }
                
                const product = productSales.get(productId);
                
                // Extract shipping details from metadata if available
                const shippingDetails = {};
                if (intent.metadata.shipping_name) {
                    shippingDetails.name = intent.metadata.shipping_name;
                    shippingDetails.address = {
                        line1: intent.metadata.shipping_address_line1,
                        line2: intent.metadata.shipping_address_line2,
                        city: intent.metadata.shipping_address_city,
                        state: intent.metadata.shipping_address_state,
                        postal_code: intent.metadata.shipping_address_postal_code,
                        country: intent.metadata.shipping_address_country
                    };
                }
                
                product.sales.push({
                    amount: intent.amount,
                    currency: intent.currency,
                    created: new Date(intent.created * 1000),
                    paymentIntentId: intent.id,
                    productName: intent.metadata.productName || 'Unknown Product',
                    productQuantity: intent.metadata.productQuantity || 1,
                    shipping: shippingDetails,
                });
                product.totalSales += 1;
                product.totalRevenue += intent.amount;
            }
        }
        
        // Convert to array and sort by total revenue descending
        const allProductDetails = [];
        for (const [productId, salesData] of productSales) {
            try {
                const passage = await Passage.findById(productId).populate('author');
                if (passage && passage.label === 'Product') {
                    allProductDetails.push({
                        passage: passage,
                        salesData: salesData,
                        formattedRevenue: (salesData.totalRevenue / 100).toFixed(2)
                    });
                }
            } catch (error) {
                console.error(`Error fetching product ${productId}:`, error);
            }
        }
        
        // Sort by most recent sale date instead of revenue
        allProductDetails.sort((a, b) => {
            const aLatestSale = Math.max(...a.salesData.sales.map(sale => sale.created.getTime()));
            const bLatestSale = Math.max(...b.salesData.sales.map(sale => sale.created.getTime()));
            return bLatestSale - aLatestSale; // Most recent first
        });
        
        // Apply local pagination
        const totalItems = allProductDetails.length;
        const totalPages = Math.ceil(totalItems / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const productDetails = allProductDetails.slice(startIndex, endIndex);
        
        return res.render('manage-products', {
            productDetails: productDetails,
            user: req.session.user,
            ISMOBILE: ISMOBILE,
            page: 'manage-products',
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1
        });
        
    } catch (error) {
        console.error('Error loading product sales:', error);
        return res.status(500).send('Error loading product sales. Please try again later.');
    }
}

async function markOrderShipped(req, res){
    var orderId = req.body.orderId;
    var carrier = req.body.carrier;
    var shippingService = req.body.shippingService;
    var trackingNumber = req.body.trackingNumber;
    var order = await Order.findOneAndUpdate({_id:orderId}, {$set:{
        shipped: true,
        carrier: carrier,
        trackingNumber: trackingNumber,
        shippingService: shippingService
    }},
    { returnDocument: 'after' }).populate('buyer passage');
    await systemService.sendEmail(order.buyer.email, `Your Order "${order.title}" has been shipped!`, 
    `
        View your order at: https://infinity-forum.org/order/`+order._id+`
    `);
    return res.render("order", {order: order, seller: false});
}

async function reverseShipped(req, res){
    var orderId = req.body.orderId;
    var order = await Order.findOneAndUpdate({_id:orderId}, {$set:{
        shipped: false
    }},
    { returnDocument: 'after' }).populate('buyer passage');
    return res.render("order", {order: order, seller: false});
}


module.exports = {
    market,
    dashboard,
    orders,
    sales,
    buyProductLink,
    manageProducts,
    markOrderShipped,
    order,
    sale,
    reverseShipped
};