import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// Import controllers and services
import marketController from '../../controllers/marketController.js';
import stripeController from '../../controllers/stripeController.js';
import { User } from '../../models/User.js';
import { Passage } from '../../models/Passage.js';
import Order from '../../models/Order.js';
import System from '../../models/System.js';

// Import test helpers
import {
  createTestUser,
  createTestProduct,
  createTestSystem,
  createMockSession,
  mockAccessSecret,
  cleanupTestData
} from '../utils/testHelpers.js';

import {
  createCheckoutCompletedWebhook,
  setupCompletePurchaseMocks,
  mockStripeLineItems,
  mockStripePaymentIntent,
  mockStripeCharge,
  mockStripeBalanceTransaction
} from '../utils/stripeHelpers.js';

// Mock common-utils accessSecret function
vi.mock('../../common-utils.js', () => ({
  accessSecret: vi.fn().mockImplementation(mockAccessSecret()),
  percentOfPayouts: vi.fn().mockResolvedValue(0.1),
  totalStarsGiven: vi.fn().mockResolvedValue(1000)
}));

// Mock starService
vi.mock('../../services/starService.js', () => ({
  addStarsToUser: vi.fn().mockResolvedValue(true)
}));

describe('Product Purchase Integration Tests', () => {
  let app;
  let buyer, seller, product, system;
  let buyerSession, sellerSession;

  beforeEach(async () => {
    // Clean up any existing test data
    await cleanupTestData();

    // Create test app with necessary middleware
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Mock session middleware
    app.use((req, res, next) => {
      req.session = req.testSession || {};
      req.rawBody = req.body; // Mock raw body for webhook
      next();
    });

    // Add routes
    app.post('/buy-product-link', marketController.buyProductLink);
    app.post('/stripe-webhook', stripeController.stripeWebhook);

    // Create test users
    buyer = await createTestUser({
      email: 'buyer@example.com',
      name: 'Test Buyer',
      stars: 50,
      donationStars: 0
    });

    seller = await createTestUser({
      email: 'seller@example.com',
      name: 'Test Seller',
      stars: 0,
      donationStars: 0,
      stripeAccountId: 'acct_test_seller123'
    });

    // Create test product
    product = await createTestProduct(seller, {
      title: 'Test Gaming Mouse',
      price: 29.99,
      inStock: 5
    });

    // Create test system
    system = await createTestSystem({
      totalStarsGiven: 1000,
      platformAmount: 0,
      userAmount: 0
    });

    // Create mock sessions
    buyerSession = createMockSession(buyer);
    sellerSession = createMockSession(seller);
  });

  describe('POST /buy-product-link', () => {
    it('should create Stripe checkout session for valid product purchase', async () => {
      // Setup Stripe mocks
      const mocks = setupCompletePurchaseMocks({
        productId: product._id.toString(),
        quantity: 2,
        amount: 5998, // $59.98 for 2 items
        customerEmail: buyer.email
      });

      const response = await request(app)
        .post('/buy-product-link')
        .send({
          _id: product._id.toString(),
          quantity: 2
        })
        .set('testSession', JSON.stringify(buyerSession))
        .expect(200);

      // Should return Stripe checkout URL
      expect(response.text).toContain('https://checkout.stripe.com/pay/');
    });

    it('should reject purchase when product is out of stock', async () => {
      // Update product to be out of stock
      await Passage.findByIdAndUpdate(product._id, { inStock: 0 });

      const response = await request(app)
        .post('/buy-product-link')
        .send({
          _id: product._id.toString(),
          quantity: 1
        })
        .set('testSession', JSON.stringify(buyerSession))
        .expect(200);

      expect(response.text).toBe('Product out of Stock.');
    });

    it('should reject purchase with invalid quantity', async () => {
      const response = await request(app)
        .post('/buy-product-link')
        .send({
          _id: product._id.toString(),
          quantity: 10 // More than available stock (5)
        })
        .set('testSession', JSON.stringify(buyerSession))
        .expect(200);

      expect(response.text).toContain('Must enter an integer between 1 and');
    });

    it('should redirect to login when user not authenticated', async () => {
      const response = await request(app)
        .post('/buy-product-link')
        .send({
          _id: product._id.toString(),
          quantity: 1
        })
        .expect(200);

      expect(response.text).toContain('/loginform');
    });
  });

  describe('Stripe Webhook Processing', () => {
    it('should process checkout.session.completed webhook correctly', async () => {
      // Setup all Stripe API mocks
      const sessionId = 'cs_test_completed_session';
      const paymentIntentId = 'pi_test_payment_intent';
      const chargeId = 'ch_test_charge';
      const balanceTransactionId = 'txn_test_balance';
      const quantity = 2;
      const amount = 5998; // $59.98 in cents
      const fee = 204; // Stripe fee (2.9% + $0.30)

      // Mock Stripe API calls
      mockStripeLineItems(sessionId, [{
        id: 'li_test_line_item',
        price: {
          product: {
            metadata: {
              type: 'Product',
              productId: product._id.toString(),
              quantity: quantity.toString()
            }
          }
        }
      }]);

      mockStripePaymentIntent(paymentIntentId, {
        latest_charge: chargeId
      });

      mockStripeCharge(chargeId, {
        balance_transaction: balanceTransactionId
      });

      mockStripeBalanceTransaction(balanceTransactionId, {
        amount: amount,
        fee: fee,
        net: amount - fee
      });

      // Create webhook payload
      const webhookPayload = createCheckoutCompletedWebhook({
        id: sessionId,
        amount_total: amount,
        customer_details: {
          email: buyer.email
        },
        payment_intent: paymentIntentId
      });

      // Mock Stripe webhook signature verification
      app.use((req, res, next) => {
        req.headers['stripe-signature'] = 'mock_signature';
        next();
      });

      // Mock Stripe webhook verification
      const stripe = require('stripe');
      vi.mocked(stripe).webhooks = {
        constructEvent: vi.fn().mockReturnValue(webhookPayload)
      };

      // Send webhook
      const response = await request(app)
        .post('/stripe-webhook')
        .send(webhookPayload)
        .set('stripe-signature', 'mock_signature')
        .expect(200);

      // Verify Order was created
      const order = await Order.findOne({
        buyer: buyer.email,
        passage: product._id.toString()
      });

      expect(order).toBeTruthy();
      expect(order.title).toBe(product.title);
      expect(order.seller).toBe(seller._id.toString());
      expect(order.quantity).toBe(quantity);
      expect(order.shipped).toBe(false);

      // Verify product stock was reduced
      const updatedProduct = await Passage.findById(product._id);
      expect(updatedProduct.inStock).toBe(product.inStock - quantity); // 5 - 2 = 3

      // Verify seller received stars (via starService.addStarsToUser mock)
      const starService = await import('../../services/starService.js');
      expect(starService.addStarsToUser).toHaveBeenCalledWith(
        expect.objectContaining({ _id: seller._id }),
        expect.any(Number)
      );

      // Verify System totals were updated correctly
      const updatedSystem = await System.findById(system._id);
      const platformCommission = amount * 0.10; // 10% commission
      const userPayoutAmount = platformCommission * 0.25; // 25% of commission goes to users
      const platformAmount = platformCommission - userPayoutAmount - fee;

      expect(updatedSystem.platformAmount).toBe(Math.floor(platformAmount));
      expect(updatedSystem.userAmount).toBe(Math.floor(userPayoutAmount));
    });

    it('should handle buyer receiving donation stars when user exists', async () => {
      const sessionId = 'cs_test_donation_session';
      const amount = 2999; // $29.99
      const fee = 117;

      // Setup mocks for a single item purchase
      mockStripeLineItems(sessionId, [{
        price: {
          product: {
            metadata: {
              type: 'Product',
              productId: product._id.toString(),
              quantity: '1'
            }
          }
        }
      }]);

      mockStripePaymentIntent('pi_donation_intent', {
        latest_charge: 'ch_donation_charge'
      });

      mockStripeCharge('ch_donation_charge', {
        balance_transaction: 'txn_donation_balance'
      });

      mockStripeBalanceTransaction('txn_donation_balance', {
        amount: amount,
        fee: fee,
        net: amount - fee
      });

      const webhookPayload = createCheckoutCompletedWebhook({
        id: sessionId,
        amount_total: amount,
        customer_details: {
          email: buyer.email // User exists in system
        },
        payment_intent: 'pi_donation_intent'
      });

      // Mock webhook verification
      const stripe = require('stripe');
      vi.mocked(stripe).webhooks = {
        constructEvent: vi.fn().mockReturnValue(webhookPayload)
      };

      await request(app)
        .post('/stripe-webhook')
        .send(webhookPayload)
        .set('stripe-signature', 'mock_signature')
        .expect(200);

      // Verify buyer received donation stars
      const updatedBuyer = await User.findById(buyer._id);
      expect(updatedBuyer.donationStars).toBeGreaterThan(buyer.donationStars);
    });

    it('should create order even when user email not found in system', async () => {
      const sessionId = 'cs_test_anonymous_session';
      const unknownEmail = 'unknown@example.com';

      // Setup mocks
      mockStripeLineItems(sessionId, [{
        price: {
          product: {
            metadata: {
              type: 'Product',
              productId: product._id.toString(),
              quantity: '1'
            }
          }
        }
      }]);

      mockStripePaymentIntent('pi_anonymous_intent', {
        latest_charge: 'ch_anonymous_charge'
      });

      mockStripeCharge('ch_anonymous_charge', {
        balance_transaction: 'txn_anonymous_balance'
      });

      mockStripeBalanceTransaction('txn_anonymous_balance');

      const webhookPayload = createCheckoutCompletedWebhook({
        id: sessionId,
        customer_details: {
          email: unknownEmail
        },
        payment_intent: 'pi_anonymous_intent'
      });

      // Mock webhook verification
      const stripe = require('stripe');
      vi.mocked(stripe).webhooks = {
        constructEvent: vi.fn().mockReturnValue(webhookPayload)
      };

      await request(app)
        .post('/stripe-webhook')
        .send(webhookPayload)
        .set('stripe-signature', 'mock_signature')
        .expect(200);

      // Verify Order was still created with email
      const order = await Order.findOne({
        buyer: unknownEmail,
        passage: product._id.toString()
      });

      expect(order).toBeTruthy();
      expect(order.title).toBe(product.title);

      // Verify seller still received stars
      const starService = await import('../../services/starService.js');
      expect(starService.addStarsToUser).toHaveBeenCalled();
    });
  });

  describe('End-to-End Purchase Flow', () => {
    it('should complete full purchase flow from button click to order creation', async () => {
      // Step 1: Create checkout session
      setupCompletePurchaseMocks({
        productId: product._id.toString(),
        quantity: 1,
        customerEmail: buyer.email
      });

      const checkoutResponse = await request(app)
        .post('/buy-product-link')
        .send({
          _id: product._id.toString(),
          quantity: 1
        })
        .set('testSession', JSON.stringify(buyerSession))
        .expect(200);

      expect(checkoutResponse.text).toContain('checkout.stripe.com');

      // Step 2: Simulate successful payment via webhook
      const sessionId = 'cs_test_e2e_session';
      const amount = 2999; // $29.99

      mockStripeLineItems(sessionId, [{
        price: {
          product: {
            metadata: {
              type: 'Product',
              productId: product._id.toString(),
              quantity: '1'
            }
          }
        }
      }]);

      mockStripePaymentIntent('pi_e2e_intent', {
        latest_charge: 'ch_e2e_charge'
      });

      mockStripeCharge('ch_e2e_charge', {
        balance_transaction: 'txn_e2e_balance'
      });

      mockStripeBalanceTransaction('txn_e2e_balance', {
        amount: amount,
        fee: 117,
        net: amount - 117
      });

      const webhookPayload = createCheckoutCompletedWebhook({
        id: sessionId,
        amount_total: amount,
        customer_details: {
          email: buyer.email
        },
        payment_intent: 'pi_e2e_intent'
      });

      // Mock webhook verification
      const stripe = require('stripe');
      vi.mocked(stripe).webhooks = {
        constructEvent: vi.fn().mockReturnValue(webhookPayload)
      };

      await request(app)
        .post('/stripe-webhook')
        .send(webhookPayload)
        .set('stripe-signature', 'mock_signature')
        .expect(200);

      // Step 3: Verify complete transaction
      const finalOrder = await Order.findOne({
        buyer: buyer.email,
        seller: seller._id.toString(),
        passage: product._id.toString()
      });

      expect(finalOrder).toBeTruthy();
      expect(finalOrder.quantity).toBe(1);
      expect(finalOrder.shipped).toBe(false);

      const finalProduct = await Passage.findById(product._id);
      expect(finalProduct.inStock).toBe(4); // Reduced from 5 to 4

      const finalBuyer = await User.findById(buyer._id);
      expect(finalBuyer.donationStars).toBeGreaterThan(buyer.donationStars);
    });
  });
});