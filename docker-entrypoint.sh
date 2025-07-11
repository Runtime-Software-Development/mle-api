#!/bin/sh
set -e

# This script is the Docker entrypoint.
# It checks the NODE_ENV and runs the appropriate command for the Node.js app.

# Ensure the correct ownership and permissions for the app directory
# This might already be handled by the Dockerfile, but a good safeguard here.
# chown -R node:node /usr/src/app
# chmod -R 755 /usr/src/app

# Switch to the 'node' user before executing the main command
# This ensures security by not running the app as root.
# exec su-exec node "$@"