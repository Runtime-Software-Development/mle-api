#!/usr/bin/env node

/*!
 * MLP.API.Server
 * File: server.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description: Start server for MLE API application. 
 * 
 * Revision History:
 * Date         Notes
 * 2024-Sep-20  Converted to async/await for Node application
 */

/**
 * Module dependencies
 */

import createApp from './src/app.js';
import http from 'http';

// Constants
const PORT = normalizePort(process.env.MLE_API_PORT || '3001');
const SERVER_TIMEOUT = 30000;

/**
 * Normalize a port into a number, string, or false.
 *
 * The function takes a value and normalizes it to a port number.
 * A port number should be a positive integer. If the value is not a
 * number, it is returned as is. If the value is a number, then the
 * following rules are applied:
 *
 * - If the value is a positive number, it is returned as is.
 * - If the value is a negative number, it is returned as false.
 *
 * @param {string|number} val - The value to normalize.
 * @return {number|string|false} The normalized port number or false.
 */
export function normalizePort(val) {
  const port = parseInt(val, 10)

  if (isNaN(port)) {
    // Named pipe
    return val
  }

  if (port >= 0) {
    // Port number
    return port
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 *
 * @param {Error} error - An error object.
 * @see {@link https://nodejs.org/api/errors.html#errors_common_system_errors}
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    // EACCES: The port requires elevated privileges
    // https://nodejs.org/api/errors.html#errors_common_system_errors
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`)
      process.exit(1);

    // EADDRINUSE: The port is already in use
    // https://nodejs.org/api/errors.html#errors_common_system_errors
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`)
      process.exit(1)

    // Default: Throw the error
    default:
      throw error
  }
}

/**
 * Server initialization
 */

createApp().then((app) => {
  /**
 * Get port from environment and store in Express
 */

  app.set('port', PORT);

  /**
   * Create HTTP server
   */

  const server = http.createServer(app);


  /**
   * Listen on provided port, on all network interfaces
   */

  try {
    server.listen(PORT);
    server.on('error', onError);
    server.on('listening', function () {
      const addr = server.address();
      const uri = typeof addr === 'string' ? addr : `${process.env.MLE_API_HOST || 'localhost'}:${addr.port}`;
      console.log(`API Listening on ${uri}`);
    });
    server.timeout = SERVER_TIMEOUT;
  } catch (err) {
    console.error('Error starting server:', err);
  }

  process.on('uncaughtException', function (err) {
    console.error('Fatal Error occurred.', err);
    server.close();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    throw new Error(`Unhandled Rejection, ${promise}\nReason: ${reason}`);
  });


}).catch((err) => {
  console.error(err);
});
