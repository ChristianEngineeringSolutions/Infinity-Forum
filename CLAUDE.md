# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (uses nodemon for auto-restart)
- **Start production server**: `npm start`
- **Process management**: The app uses PM2 via `ecosystem.config.js` for production deployment

## Application Architecture

This is a **Node.js/Express forum application** called "Infinity-Forum" (IF) - a collaborative platform for engineering solutions. The codebase has been refactored from a monolithic structure to a more modular MVC architecture.

### Core Technology Stack
- **Backend**: Express.js with MongoDB (Mongoose ODM)
- **Views**: EJS templating engine
- **Real-time**: Socket.IO for live features
- **Authentication**: Passport.js with local strategy
- **Sessions**: MongoDB-backed sessions with 30-day TTL
- **Background Jobs**: Redis + Bull Queue for feed generation and star processing
- **Distributed Locking**: Redlock for queue concurrency control
- **Payments**: Stripe integration with webhooks
- **File Processing**: Sharp (images), FFmpeg (video), file uploads
- **Identity Verification**: Stripe Identity API integration

### Key Application Structure

**Main Entry Points**:
- `app.js` - New modular main application file (refactored from sasame.js)
- `sasame.js` - Legacy monolithic file (deprecated, kept for reference)

**Data Models** (all in `/models/`):
- **Passage**: Central content model (posts/articles with rich media)
- **User**: User accounts with social features 
- **Message**: Private messaging system
- **Category/Subcat**: Content organization
- **Interaction**: User engagement tracking
- **Notification**: Real-time notifications
- **Star/Bookmark**: Content rating and saving
- **Follower**: Social following relationships
- **VerificationSession**: Identity verification tracking
- **System**: Global system state and metrics
- **Visitor**: Anonymous user tracking

**Refactored MVC Pattern**:
- **Controllers** (`/controllers/`): 
  - `passageController.js` - Passage CRUD operations (uses atomic updates)
  - `userController.js` - User management and settings (uses atomic updates)
  - `authController.js` - Authentication and registration
  - `adminController.js` - Admin panel operations
  - `stripeController.js` - Payment processing and webhooks
  - `verificationController.js` - Identity verification
  - `bookmarkController.js` - Bookmark management
  - `pageController.js` - Static page rendering
  - `paginationController.js` - Pagination utilities
  - `messageController.js` - Private messaging
- **Services** (`/services/`):
  - `passageService.js` - Business logic for passages and feed generation
  - `userService.js` - User-related business logic
  - `starService.js` - Star/rating operations (original synchronous)
  - `starServiceQueued.js` - Queue-based star operations
  - `starQueueProcessor.js` - Bull queue processor with Redlock
  - `fileService.js` - File upload and processing
  - `systemService.js` - System-wide operations
  - `verificationService.js` - Identity verification processing
  - `bookmarkService.js` - Bookmark operations
  - `messageService.js` - Message handling
  - `paymentService.js` - Stripe payment utilities
- **Routes** (`/routes/`): RESTful API endpoints
- **Configuration** (`/config/`):
  - `database.js` - MongoDB connection setup
  - `express.js` - Express middleware configuration
  - `redis.js` - Redis and Bull queue initialization
  - `socket.js` - Socket.IO configuration
- **Middleware** (`/middleware/`):
  - `auth.js` - Authentication middleware
  - `upload.js` - File upload configuration
- **Background Jobs** (`/cron/`):
  - `rewardUsers.js` - Monthly reward distribution
  - Other scheduled tasks
- **Views**: Extensive EJS template system with modular components

### Environment Configuration

- Copy `.env_sample` to `.env` and configure required values
- Requires MongoDB running locally or remote connection
- Optional Redis for background job processing
- Google Cloud services for production features

### Database Setup
- **Local**: MongoDB at `mongodb://127.0.0.1:27017/sasame`
- **Remote**: Configure `MONGODB_CONNECTION_URL` with credentials
- No migration scripts - uses Mongoose schema validation

### Key Features
- **Content Management**: Rich media passages with collaboration
- **Social Features**: Following, stars, bookmarks, notifications
- **Forum System**: Categories, subcategories, threaded discussions  
- **Real-time**: Live notifications and messaging via Socket.IO
- **Payment System**: Stripe subscriptions and donations
- **Admin System**: Administrative controls and daemon execution
- **File Management**: Image/video upload and processing

### Development Notes
- Uses `nodemon.json` for development file watching
- No formal test framework detected - `test.js` is a simple API test
- Most business logic centralized in main `sasame.js` file
- EJS views in `/views/` with extensive component modularity
- File uploads stored in `/dist/` and `/protected/` directories