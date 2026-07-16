#!/bin/sh
set -e

echo "=== TIQKETS Startup ==="
echo "Running database migrations..."
node server_dist/migrate.js

echo "Starting application server..."
exec node server_dist/index.js
