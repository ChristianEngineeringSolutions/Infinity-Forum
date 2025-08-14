'use strict';

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { requiresLogin } = require('../middleware/auth');

router.get('/market', marketController.market);
router.get('/market-dashboard/:page?/:search?', requiresLogin, marketController.dashboard);
router.get('/orders/:page?/:search?', marketController.orders);
router.get('/sales/:page?/:search?', marketController.sales);
router.post('/buy-product-link', marketController.buyProductLink);
router.post('/mark-order-shipped', marketController.markOrderShipped);
router.get('/order/:title/:id', marketController.order);
router.get('/sale/:title/:id', marketController.sale);

module.exports = router;