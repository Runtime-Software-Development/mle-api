/*!
 * MLP.API.Services.Queries.Stats
 * File: stats.queries.js
 * Copyright(c) 2022 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Get summary statistics on collection.
 *
 * @return {Object} query binding
 */

export function summary(tbl) {
    return {
        sql: `SELECT count(*)
              FROM ${tbl};`,
        data: [],
    };
}
