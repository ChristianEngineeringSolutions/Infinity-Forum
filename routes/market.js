'use strict';

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { requiresLogin } = require('../middleware/auth');

router.get('/market', marketController.market);
router.get('/market-dashboard', requiresLogin, marketController.dashboard);
router.get('/orders', marketController.orders);
router.get('/sales', marketController.sales);
router.post('/buy-product-link', marketController.buyProductLink);
router.post('/mark-order-shipped', marketController.markOrderShipped);

module.exports = router;