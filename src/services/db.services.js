/*!
 * MLP.API.Services.Database
 * File: db.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Initialize connection pool / client
 *
 * @public
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

console.log('MLE API Environment Variables: %s', JSON.stringify(process.env, null, 2));

/**
 * Create client pool to allow for reusable pool of
 * clients to check out, use, and return.
 */

const pool = new pg.Pool({
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    max: 20, // max number of clients in the pool
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 10000
});

/**
 * Pool will emit an error on behalf of any idle clients
 * it contains if a backend error or network partition
 * happens.
 */

pool.on('error', (error, client) => {
  console.error('Unexpected error on idle database client:', {
    user: client?.user || process.env.POSTGRES_USER,
    database: client?.database || process.env.POSTGRES_DB,
    host: client?.host || process.env.POSTGRES_HOST,
    port: client?.port || process.env.POSTGRES_PORT,
    error: error.message, // Include the error message
    // stack: error.stack // Include the stack trace for debugging
  });

  // Optionally, take additional actions, such as:
  // - Logging the error to an external monitoring service
  // - Restarting the application if the error is critical
});

pool.on('acquire', function () {
  console.log('Pool Connection Acquired - Timestamp: ', Date.now());
});

pool.on('connect', function () {
  console.log('Pool Connection Established - Timestamp: ', Date.now());
});

pool.on('remove', function () {});

/**
 * Test database connection.
 */
export const testDatabaseConnection = async () => {
  console.log('Testing database connection...');
  try {
    // Perform a simple query to test the connection
    const result = await pool.query('SELECT NOW() AS current_time');
    console.log('Database connection successful:', result.rows[0].current_time);
  } catch (error) {
    console.error('Database connection failed:', {
      message: error.message,
      stack: error.stack,
    });
    // Optionally, exit the process if the database is critical
    // process.exit(1);
  }
};

/**
 * Export pg-pool object instance.
 */

export default pool;

