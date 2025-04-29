#!/bin/bash

pm2 stop sasame
pm2 delete sasame
pm2 kill
pm2 start sasame.js

LOCK_FILE="/var/lock/nginx_restart_limit.lock"
MAX_CALLS=3
TIME_WINDOW=60

echo "Attempting to acquire lock..."
flock -n 200 "$LOCK_FILE" -c '
  echo "Lock acquired (if this line appears)"
  COUNT=$(grep -c "^$(date +%s)" "$LOCK_FILE")
  echo "Current count: $COUNT"
  if [ "$COUNT" -lt "$MAX_CALLS" ]; then
    date +%s >> "$LOCK_FILE"
    echo "Timestamp written to lock file"
    sudo /usr/bin/systemctl restart nginx
    echo "Nginx restart attempted"
    exit 0
  else
    echo "Rate limit exceeded for Nginx restart." >&2
    exit 1
  fi
'
echo "Flock command finished"