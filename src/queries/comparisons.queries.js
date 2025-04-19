/*!
 * MLP.API.Services.Queries.Comparisons
 * File: comparisons.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Insert comparison for given capture pair IDs.
 *
 * @return {Object} query binding
 */

export function upsertComparison(
    historicCaptureID,
    modernCaptureID
) {
    let sql = `INSERT INTO comparison_indices (
                                historic_captures,
                                modern_captures,
                                created_at, 
                                updated_at
                                )
            VALUES ($1::integer, $2::integer, NOW(), NOW())
            ON CONFLICT (historic_captures, modern_captures) 
            DO 
                UPDATE SET updated_at = NOW()
            RETURNING *;`;
    return {
        sql: sql,
        data: [historicCaptureID, modernCaptureID],
    };
}

/**
 * Query: Delete comparison by ID.
 *
 * @return {Object} query binding
 */

export function deleteComparison(id) {
    let sql = `DELETE FROM comparison_indices WHERE id RETURNING *;`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Delete all comparisons for given capture.
 *
 * @param node
 * @return {Object} query binding
 */

export function deleteCaptureComparisons(node) {
    const {id='', type=''} = node || {};
    let sql = `DELETE FROM comparison_indices 
                WHERE ${type} = $1::integer
                RETURNING *;`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Generate query: Retrieve comparisons by id array.
 *
 * @return {Function} query function
 * @public
 */

export function filterByIDArray(ids, offset, limit) {
    const sql = `SELECT 
            *, 
            (SELECT COUNT(*) FROM comparison_indices WHERE id = ANY($1)) as total
            FROM comparison_indices 
            WHERE id = ANY($1)
            OFFSET ${offset}
            LIMIT ${limit}`;
    return {
        sql: sql,
        data: [ids],
    };
}

/**
 * Query: Get comparisons for given capture node. Model options
 * include 'historic_captures' and 'modern_captures'.
 *
 * @return {Object} query binding
 */

export function getComparisons(node) {
    const { type = '', id = '' } = node || {};
    let sql = `SELECT * 
            FROM comparison_indices 
            WHERE ${type} = $1::integer`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get comparisons metadata for given capture node.
 * Model options include 'historic_captures' and
 * 'modern_captures'.
 *
 * @return {Object} query binding
 */

export function getComparisonsData(node) {
    const { type = '', id = '' } = node || {};
    let sql = `SELECT * 
            FROM comparison_indices 
            INNER JOIN historic_captures hc 
                ON comparison_indices.historic_captures = hc.nodes_id
                 INNER JOIN modern_captures mc 
                     ON comparison_indices.modern_captures = mc.nodes_id
            WHERE ${type} = $1::integer`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get capture comparisons for station.
 *
 * @param {String} id
 * @return {Object} query binding
 */

export function getComparisonsByStationID(id) {
    let sql = `
        WITH hc AS (
            SELECT historic_captures.nodes_id,
                   historic_captures.owner_id
            FROM historic_captures
                     INNER JOIN (
                SELECT nodes_id as hv_id
                FROM historic_visits
                WHERE owner_id = $1::integer) as hv
                                ON hv_id = historic_captures.owner_id
            GROUP BY historic_captures.nodes_id
        )
        SELECT comparison_indices.id,
               comparison_indices.modern_captures,
               comparison_indices.historic_captures
        FROM comparison_indices
                 INNER JOIN hc
                            ON hc.nodes_id = comparison_indices.historic_captures
        GROUP BY hc.nodes_id,
                 comparison_indices.id,
                 comparison_indices.modern_captures,
                 comparison_indices.historic_captures;
    `;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get capture comparisons metadata for station.
 *
 * @param {String} id
 * @return {Object} query binding
 */

export function getComparisonsByLocationID(id) {
    let sql = `
        WITH mc as (
            SELECT *
            FROM modern_captures
            WHERE modern_captures.owner_id = $1::integer)
        SELECT comparison_indices.id,
               comparison_indices.modern_captures, 
               comparison_indices.historic_captures
        FROM comparison_indices
                 INNER JOIN mc
                            ON mc.nodes_id = comparison_indices.modern_captures
        GROUP BY mc.nodes_id,
                 comparison_indices.modern_captures,
                 comparison_indices.historic_captures,
                 comparison_indices.id;
    `;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get capture comparisons metadata for historic visit.
 *
 * @param {String} id
 * @return {Object} query binding
 */

export function getComparisonsByHistoricVisitID(id) {
    let sql = `
        WITH hc as (
            SELECT *
            FROM historic_captures
            WHERE historic_captures.owner_id = $1::integer)
        SELECT comparison_indices.id,
               comparison_indices.modern_captures,
               comparison_indices.historic_captures
        FROM comparison_indices
                 INNER JOIN hc
                            ON hc.nodes_id = comparison_indices.historic_captures
        GROUP BY hc.nodes_id,
                 comparison_indices.modern_captures,
                 comparison_indices.historic_captures,
                 comparison_indices.id;
    `;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get capture comparisons metadata for modern visit.
 *
 * @param {string} id
 * @return {Object} query binding
 */

export function getComparisonsByModernVisitID(id) {
    let sql = `
        WITH mc as (
            SELECT modern_captures.nodes_id
            FROM modern_captures
                     INNER JOIN (
                SELECT locations.nodes_id
                FROM locations
                WHERE locations.owner_id = $1::integer) as locs
                                ON locs.nodes_id = modern_captures.owner_id
        )
        SELECT comparison_indices.id,
               comparison_indices.modern_captures, 
               comparison_indices.historic_captures
        FROM comparison_indices
                 INNER JOIN mc
                            ON mc.nodes_id = comparison_indices.modern_captures
        GROUP BY mc.nodes_id,
                 comparison_indices.modern_captures,
                 comparison_indices.historic_captures,
                 comparison_indices.id;
    `;
    return {
        sql: sql,
        data: [id],
    };
}
