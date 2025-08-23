import nock from 'nock';

/**
 * Mock Stripe checkout session creation
 */
export function mockStripeCheckoutSession(sessionData = {}) {
  const defaultSession = {
    id: 'cs_test_mock_session',
    url: 'https://checkout.stripe.com/pay/cs_test_mock_session',
    mode: 'payment',
    customer_email: null,
    payment_status: 'unpaid',
    ...sessionData
  };

  return nock('https://api.stripe.com')
    .post('/v1/checkout/sessions')
    .reply(200, defaultSession);
}

/**
 * Mock Stripe webhook event verification
 */
export function mockStripeWebhookVerification(eventData) {
  // Mock the webhook signature verification
  const mockEvent = {
    id: 'evt_test_webhook',
    type: 'checkout.session.completed',
    data: {
      object: eventData
    },
    ...eventData
  };

  return mockEvent;
}

/**
 * Create a mock Stripe checkout completed webhook payload
 */
export function createCheckoutCompletedWebhook(overrides = {}) {
  const defaultPayload = {
    id: 'cs_test_completed_session',
    object: 'checkout.session',
    amount_total: 2999, // $29.99 in cents
    currency: 'usd',
    customer_details: {
      email: 'buyer@example.com'
    },
    payment_intent: 'pi_test_payment_intent',
    payment_status: 'paid',
    status: 'complete',
    metadata: {},
    ...overrides
  };

  return {
    type: 'checkout.session.completed',
    data: {
      object: defaultPayload
    }
  };
}

/**
 * Mock Stripe line items retrieval
 */
export function mockStripeLineItems(sessionId, lineItemsData = []) {
  const defaultLineItems = [{
    id: 'li_test_line_item',
    object: 'item',
    amount_total: 2999,
    currency: 'usd',
    description: 'Test Product',
    quantity: 1,
    price: {
      id: 'price_test_price',
      product: {
        id: 'prod_test_product',
        object: 'product',
        name: 'Test Product',
        metadata: {
          type: 'Product',
          productId: '507f1f77bcf86cd799439011', // Mock ObjectId
          quantity: '1'
        }
      }
    }
  }];

  const lineItems = lineItemsData.length > 0 ? lineItemsData : defaultLineItems;

  return nock('https://api.stripe.com')
    .get(`/v1/checkout/sessions/${sessionId}/line_items`)
    .query({ expand: ['data.price.product'] })
    .reply(200, {
      object: 'list',
      data: lineItems
    });
}

/**
 * Mock Stripe payment intent retrieval
 */
export function mockStripePaymentIntent(paymentIntentId, overrides = {}) {
  const defaultPaymentIntent = {
    id: paymentIntentId,
    object: 'payment_intent',
    amount: 2999,
    currency: 'usd',
    status: 'succeeded',
    latest_charge: 'ch_test_charge',
    ...overrides
  };

  return nock('https://api.stripe.com')
    .get(`/v1/payment_intents/${paymentIntentId}`)
    .reply(200, defaultPaymentIntent);
}

/**
 * Mock Stripe charge retrieval
 */
export function mockStripeCharge(chargeId, overrides = {}) {
  const defaultCharge = {
    id: chargeId,
    object: 'charge',
    amount: 2999,
    currency: 'usd',
    status: 'succeeded',
    balance_transaction: 'txn_test_balance_transaction',
    ...overrides
  };

  return nock('https://api.stripe.com')
    .get(`/v1/charges/${chargeId}`)
    .reply(200, defaultCharge);
}

/**
 * Mock Stripe balance transaction retrieval
 */
export function mockStripeBalanceTransaction(transactionId, overrides = {}) {
  const defaultTransaction = {
    id: transactionId,
    object: 'balance_transaction',
    amount: 2999,
    currency: 'usd',
    fee: 117, // Stripe's typical 2.9% + $0.30 fee
    net: 2882,
    status: 'available',
    ...overrides
  };

  return nock('https://api.stripe.com')
    .get(`/v1/balance_transactions/${transactionId}`)
    .reply(200, defaultTransaction);
}

/**
 * Setup all necessary Stripe mocks for a complete purchase flow
 */
export function setupCompletePurchaseMocks(options = {}) {
  const {
    sessionId = 'cs_test_session',
    paymentIntentId = 'pi_test_intent',
    chargeId = 'ch_test_charge',
    balanceTransactionId = 'txn_test_balance',
    productId = '507f1f77bcf86cd799439011',
    quantity = 1,
    amount = 2999,
    customerEmail = 'buyer@example.com'
  } = options;

  // Mock checkout session creation
  mockStripeCheckoutSession({
    id: sessionId,
    url: `https://checkout.stripe.com/pay/${sessionId}`
  });

  // Mock line items with product metadata
  mockStripeLineItems(sessionId, [{
    id: 'li_test_line_item',
    price: {
      product: {
        metadata: {
          type: 'Product',
          productId: productId,
          quantity: quantity.toString()
        }
      }
    }
  }]);

  // Mock payment intent
  mockStripePaymentIntent(paymentIntentId, {
    latest_charge: chargeId
  });

  // Mock charge
  mockStripeCharge(chargeId, {
    balance_transaction: balanceTransactionId
  });

  // Mock balance transaction
  mockStripeBalanceTransaction(balanceTransactionId, {
    amount: amount,
    fee: Math.round(amount * 0.029 + 30), // 2.9% + $0.30
    net: amount - Math.round(amount * 0.029 + 30)
  });

  return {
    sessionId,
    paymentIntentId,
    chargeId,
    balanceTransactionId
  };
}