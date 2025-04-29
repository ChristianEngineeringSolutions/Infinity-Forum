#!/bin/bash 

pm2 stop sasame
pm2 delete sasame
pm2 kill
pm2 start sasame.js

LOCK_DIR="/var/lock/uriahsanders99"
LOCK_FILE="$LOCK_DIR/nginx_restart_limit.lock"
MAX_CALLS=3
TIME_WINDOW=60  # seconds

# Ensure the directory exists
mkdir -p "$LOCK_DIR" 2>/dev/null
chmod 755 "$LOCK_DIR" 2>/dev/null

# Get current timestamp
CURRENT_TIME=$(date +%s)

# Create lock file if it doesn't exist
touch "$LOCK_FILE" 2>/dev/null
chmod 644 "$LOCK_FILE" 2>/dev/null

echo "DEBUG: Checking restart history"

# Clean old entries (older than TIME_WINDOW seconds)
TMP_FILE=$(mktemp)
while read timestamp; do
  if [ -n "$timestamp" ] && [ $(( CURRENT_TIME - timestamp )) -lt $TIME_WINDOW ]; then
    echo "$timestamp" >> "$TMP_FILE"
  fi
done < "$LOCK_FILE"

# Replace lock file with cleaned version
mv "$TMP_FILE" "$LOCK_FILE"

# Count recent restarts
COUNT=$(wc -l < "$LOCK_FILE")
echo "DEBUG: Current restart count in last $TIME_WINDOW seconds: $COUNT"

if [ "$COUNT" -lt "$MAX_CALLS" ]; then
  echo "DEBUG: Under rate limit, restarting nginx"
  # Add current timestamp to log
  echo "$CURRENT_TIME" >> "$LOCK_FILE"

  # Restart nginx
  sudo /usr/bin/systemctl reload nginx
  RESTART_EXIT_CODE=$?
  echo "DEBUG: Nginx restart exit code: $RESTART_EXIT_CODE"
else
  echo "DEBUG: Rate limit exceeded for Nginx restart. Try again later."
  # Display timestamps in the log for debugging
  echo "DEBUG: Recent restart timestamps:"
  cat "$LOCK_FILE"
  exit 1
fi

echo "DEBUG: Script completed"