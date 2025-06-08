# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev` (uses nodemon for auto-restart)
- **Start production server**: `npm start`
- **Process management**: The app uses PM2 via `ecosystem.config.js` for production deployment

## Application Architecture

This is a **Node.js/Express forum application** called "Infinity-Forum" (IF) - a collaborative platform for engineering solutions.

### Core Technology Stack
- **Backend**: Express.js with MongoDB (Mongoose ODM)
- **Views**: EJS templating engine
- **Real-time**: Socket.IO for live features
- **Authentication**: Passport.js with local strategy
- **Sessions**: MongoDB-backed sessions with 30-day TTL
- **Background Jobs**: Redis + Bull Queue for feed generation
- **Payments**: Stripe integration
- **File Processing**: Sharp (images), FFmpeg (video), file uploads

### Key Application Structure

**Main Entry Point**: `sasame.js` - Contains most business logic in a monolithic pattern

**Data Models** (all in `/models/`):
- **Passage**: Central content model (posts/articles with rich media)
- **User**: User accounts with social features 
- **Message**: Private messaging system
- **Category/Subcat**: Content organization
- **Interaction**: User engagement tracking
- **Notification**: Real-time notifications
- **Star/Bookmark**: Content rating and saving
- **Follower**: Social following relationships

**MVC Pattern**:
- **Controllers**: Limited to `passageController.js` (most logic in main file)
- **Routes**: Basic routing in `/routes/` (index.js, passage.js)
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