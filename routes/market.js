'use strict';

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { requiresLogin } = require('../middleware/auth');

router.get('/market', marketController.market);
router.get('/market-dashboard/:page?/:search?', requiresLogin, marketController.dashboard);
router.get('/orders/:page?/:search?', requiresLogin, marketController.orders);
router.get('/sales/:page?/:search?', requiresLogin, marketController.sales);
// router.get('/manage-products', requiresLogin, marketController.manageProducts);
router.post('/buy-product-link', marketController.buyProductLink);
router.post('/mark-order-shipped', requiresLogin, marketController.markOrderShipped);
router.post('/reverse-shipped', requiresLogin, marketController.reverseShipped);
router.get('/order/:title/:id', requiresLogin, marketController.order);
router.get('/sale/:title/:id', requiresLogin, marketController.sale);

module.exports = router;