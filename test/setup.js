/*!
 * MLP.API.Tests.Setup
 * File: setup.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */


import createApp from '../src/app.js';

/**
 * Create new Express app and server server.
 * @private
 */

let app;

before(async () => {
    // set environment to test
    process.env.NODE_ENV = 'test';
    app = await createApp();
});

/**
 * Compares output data to model schema
 * @param {Object} model
 * @param {Array} data
 * @private
 */


// export global test variables  
export { app };
export const BASE_URL = '/';
