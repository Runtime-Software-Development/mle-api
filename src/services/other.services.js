/*!
 * MLP.API.Services.Other
 * File: other.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import queries from '../queries/index.queries.js';
import * as nserve from "./nodes.services.js";

/**
 * Get showcase images for frontpage image carousel.
 * - queries special 'showcase' project for encoded unsorted captures
 *   used in image carousel
 *
 * @public
 * @param client
 * @return {Promise} result
 */

export const getShowcaseCaptures = async (client) => {
    let { sql, data } = queries.other.showcase();
    let node = await client.query(sql, data);

    // query 'showcase' project for unsorted captures
    const showcaseCaptures = node.hasOwnProperty('rows') && node.rows.length > 0
        ? node.rows
        : null;

    // return captures with metadata
    return await Promise.all(
        (showcaseCaptures || []).map(async (capture) => {
            const { id = null, type=null } = capture || {};
            return await nserve.get(id, type, client);
        }));
};

