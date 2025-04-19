/*!
 * MLP.API.DB.Services.Users
 * File: users.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import * as queries from '../queries/users.queries.js'
import pool from './db.services.js';

/**
 * Get user role label.
 *
 * @public
 * @return {Promise} result
 */

export async function getRoleData() {
    let { sql, data } = queries.getRoles();
    return await pool.query(sql, data)
        .then(res => {
            return res.rows.length === 0 ? null : res.rows;
        });
}
