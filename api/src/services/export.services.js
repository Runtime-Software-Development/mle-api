/*!
 * MLP.API.Services.Export
 * File: export.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

import pool from './db.services.js';
import queries from '../queries/index.queries.js';

/**
 * Select schema for export of data.
 *
 * @public
 * @param {String} schema
 * @return {Promise} result
 */

export const get = async function(schema) {

    // file handlers router indexed by model type
    const exportHandler = {
        gis: async () => {
            let res = await getGIS();
            return res.hasOwnProperty('rows') && res.rows.length > 0 ? res.rows : null;
        },
        default: async () => {
            let res = await getGIS();
            return res.hasOwnProperty('rows') && res.rows.length > 0 ? res.rows : null;
        }
    };

    // route exporter to schema-indexed data filter
    return exportHandler.hasOwnProperty(schema)
        ? await exportHandler[schema]()
        : await exportHandler.default();
};

/**
 * Get GIS-oriented data.
 *
 * @public
 * @return {Promise} result
 */

export const getGIS = async () => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // start transaction
        await client.query('BEGIN');

        let { sql, data } = queries.export.getGIS();
        let res = await client.query(sql, data);

        // end transaction
        await client.query('COMMIT');

        // return nodes
        return res;

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.release(true);
    }

};
