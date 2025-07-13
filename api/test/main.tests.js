/*!
 * MLP.API.Tests.Main
 * File: main.test.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

import { app, BASE_URL } from './setup.js';
import { describe, it } from 'mocha';
import request from 'supertest';

/**
 * Test index page
 * @private
 */

describe('Index page test', () => {
  it('Gets base url', async () => {
    request(app)
      .get(BASE_URL)
      .expect(200);
  });
});

