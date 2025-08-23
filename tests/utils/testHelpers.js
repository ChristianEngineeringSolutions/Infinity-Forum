import { User } from '../../models/User.js';
import { Passage } from '../../models/Passage.js';
import Order from '../../models/Order.js';
import System from '../../models/System.js';
import bcrypt from 'bcrypt';

/**
 * Create a test user with given properties
 */
export async function createTestUser(userData = {}) {
  const defaultUser = {
    name: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    password: 'password123',
    verified: true,
    identityVerified: true,
    stars: 100,
    donationStars: 0,
    starsGiven: 0,
    borrowedStars: 0,
    phone: '+1234567890',
    stripeAccountId: 'acct_test123',
    stripeOnboardingComplete: true,
    canReceivePayouts: true,
    ...userData
  };

  // Hash password
  const hashedPassword = await bcrypt.hash(defaultUser.password, 10);
  defaultUser.password = hashedPassword;

  const user = new User(defaultUser);
  await user.save();
  return user;
}

/**
 * Create a test product passage
 */
export async function createTestProduct(author, productData = {}) {
  const defaultProduct = {
    title: 'Test Product',
    content: 'This is a test product for sale',
    author: author._id,
    label: 'Product',
    price: 29.99,
    inStock: 10,
    stars: 0,
    verifiedStars: 0,
    collaborators: [],
    sourceList: [],
    ...productData
  };

  const product = new Passage(defaultProduct);
  await product.save();
  return product;
}

/**
 * Create test system record
 */
export async function createTestSystem(systemData = {}) {
  const defaultSystem = {
    totalStarsGiven: 1000,
    platformAmount: 0,
    userAmount: 0,
    numUsersOnboarded: 1,
    ...systemData
  };

  const system = new System(defaultSystem);
  await system.save();
  return system;
}

/**
 * Create a mock session object for controllers
 */
export function createMockSession(user) {
  return {
    user: {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      verified: user.verified,
      identityVerified: user.identityVerified
    }
  };
}

/**
 * Mock the accessSecret function
 */
export function mockAccessSecret() {
  const originalAccessSecret = require('../../common-utils.js').accessSecret;
  
  return function accessSecretMock(secretName) {
    const mockSecrets = {
      'STRIPE_SECRET_KEY': 'sk_test_mock_key',
      'STRIPE_ENDPOINT_SECRET_KEY': 'whsec_mock_webhook_secret',
      'EMAIL_PASSWORD': 'mock_email_password',
      'RECAPTCHA_SECRET_KEY': 'mock_recaptcha_key'
    };
    
    return Promise.resolve(mockSecrets[secretName] || 'mock_secret_value');
  };
}

/**
 * Clean up test data - removes all test records
 */
export async function cleanupTestData() {
  await User.deleteMany({});
  await Passage.deleteMany({});
  await Order.deleteMany({});
  await System.deleteMany({});
}

/**
 * Wait for async operations to complete
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test order for verification
 */
export async function createTestOrder(orderData = {}) {
  const defaultOrder = {
    title: 'Test Order',
    quantity: 1,
    dateSold: new Date(),
    shipped: false,
    ...orderData
  };

  const order = new Order(defaultOrder);
  await order.save();
  return order;
}