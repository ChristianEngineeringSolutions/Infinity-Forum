# Star Queue Integration Guide

## Overview
The star queue system processes all star operations sequentially using Bull Queue with Redlock for distributed locking. This ensures idempotency and prevents race conditions.

## Integration Steps

### 1. Initialize in app.js

Add this after Redis initialization:

```javascript
// In app.js, after Redis initialization
const { initializeStarQueue } = require('./services/starQueueInit');

// After Redis is initialized
if (process.env.REDIS_URL) {
    await initializeRedis();
    
    // Initialize star queue processor
    await initializeStarQueue();
}
```

### 2. Update Controllers to Use Queued Version

Replace direct starService imports with the queued version:

```javascript
// Old:
const { starPassage, singleStarPassage } = require('../services/starService');

// New:
const { starPassage, singleStarPassage, waitForStarJob } = require('../services/starServiceQueued');
```

### 3. Handle Async Star Operations

Since operations are now queued, you have two options:

#### Option A: Fire and Forget
```javascript
// Just queue the operation and return immediately
const result = await starPassage(sessionUser, amount, passageId, userId);
if (result.success) {
    res.json({ 
        success: true, 
        message: 'Star operation queued',
        jobId: result.jobId 
    });
}
```

#### Option B: Wait for Completion
```javascript
// Queue and wait for result
const queueResult = await starPassage(sessionUser, amount, passageId, userId);
if (queueResult.success) {
    const jobResult = await waitForStarJob(queueResult.jobId, 10000); // 10 second timeout
    if (jobResult.success) {
        res.json({ 
            success: true, 
            result: jobResult.result 
        });
    }
}
```

## Features

### Idempotency
- Each star operation generates a unique idempotency key based on:
  - User ID
  - Passage ID  
  - Amount
  - Operation type (star/singleStar, deplete/nodeplete, etc.)
- Duplicate operations with the same key are automatically skipped

### Distributed Locking
- Uses Redlock to ensure only one worker processes a passage at a time
- Prevents race conditions when multiple star operations target the same passage
- Lock TTL: 60 seconds (configurable)

### Sequential Processing
- Queue concurrency set to 1 to ensure operations process in order
- Critical for maintaining star debt calculations and contribution points

### Error Handling
- Failed jobs retry up to 3 times with exponential backoff
- Failed and completed jobs are kept for debugging
- Automatic cleanup of old processed keys after 30 days

## Monitoring

### Check Job Status
```javascript
const status = await getStarJobStatus(jobId);
console.log(status);
// Returns: { state, progress, result, failedReason, etc. }
```

### Bull Dashboard (Optional)
You can add Bull Dashboard for visual monitoring:
```javascript
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const serverAdapter = new ExpressAdapter();
createBullBoard({
    queues: [new BullAdapter(starQueue)],
    serverAdapter: serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

## Performance Considerations

1. **Database Connections**: Ensure your MongoDB connection pool can handle the queue processor + web server
2. **Redis Memory**: Processed keys are stored for 30 days - monitor Redis memory usage
3. **Lock Contention**: If you see frequent lock timeouts, consider increasing the lock TTL

## Migration Strategy

1. Deploy the new queue system alongside existing code
2. Gradually migrate endpoints to use the queued version
3. Monitor for any issues
4. Once stable, remove the old synchronous code

## Troubleshooting

### Jobs Not Processing
- Check Redis connection
- Verify star queue processor is running
- Look for lock timeout errors

### Duplicate Operations
- Check idempotency key generation
- Verify processed keys aren't being cleared too early
- Ensure job IDs are unique

### Performance Issues
- Monitor queue size with `starQueue.getJobCounts()`
- Check for lock contention in logs
- Consider adding more Redis memory if needed