/*!
 * MLP.API.Services.Stats
 * File: stats.services.js
 * Copyright(c) 2022 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import pool from './db.services.js';
import * as queries from '../queries/stats.queries.js';

/**
 * Get node by ID. Returns single node object.
 *
 * @public
 * @return {Promise} result
 */

export const summary = async () => {

    const client = await pool.connect();
    const nodeTypes = ['historic_captures', 'modern_captures'];

    try {
        // get stats on node types
        return await Promise.all(
            nodeTypes.map( async (type) => {
                const {sql, data} = queries.summary(type);
                const response = await client.query(sql, data);
                return response.hasOwnProperty('rows') && response.rows.length > 0
                    ? {
                        type: type,
                        count: response.rows[0].count
                      }
                    : null;
            })
        );
    } catch (err) {
        throw err;
    } finally {
        await client.release(true);
    }
};
