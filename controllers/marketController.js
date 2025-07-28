'use strict';

const { User } = require('../models/User');
const { Passage } = require('../models/Passage');
const Order = require('../models/Order');
const browser = require('browser-detect');
const { scripts, DOCS_PER_PAGE } = require('../common-utils');
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

module.exports = {
    market,
    dashboard,
    orders,
    sales,
    products
};