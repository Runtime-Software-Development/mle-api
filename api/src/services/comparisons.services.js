/*!
 * MLP.API.Services.Comparisons
 * File: comparisons.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

import pool from './db.services.js';
import * as cmpqueries from '../queries/comparisons.queries.js';
import * as nserve from './nodes.services.js';
import queries from "../queries/index.queries.js";
import {get} from "./nodes.services.js";


/**
 * Filter comparisons by comparison ID array.
 *
 * @public
 * @return {Promise} result
 * @param comparisonIDs
 * @param offset
 * @param limit
 */

export const filterComparisonsByID = async (comparisonIDs, offset, limit) => {

    if (!comparisonIDs) return null;

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // start transaction
        await client.query('BEGIN');

        // get filtered nodes
        let { sql, data } = queries.comparisons.filterByIDArray(comparisonIDs, offset, limit);
        let comparisons = await client.query(sql, data)
            .then(res => {
                return res.rows
            });

        const count = comparisons.length > 0 ? comparisons[0].total : 0;

        // append model data for modern/historic captures
        let items = await Promise.all(
            comparisons.map(async (comparison) => {
                return {
                    historic_capture: await get(comparison.historic_captures, 'historic_captures', client),
                    modern_capture: await get(comparison.modern_captures, 'modern_captures', client)
                }
            })
        );

        // end transaction
        await client.query('COMMIT');

        return {
            query: comparisonIDs,
            limit: limit,
            offset: offset,
            results: items,
            count: count
        };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.release();
    }
};

/**
 * Update comparison.
 *
 * @public
 * @param {Object} node
 * @param {Array} comparedCaptureIDs
 * @param client
 * @return {Promise} result
 */

export const updateComparisons = async (node, comparedCaptureIDs, client ) => {

    if (!node || !comparedCaptureIDs) return null;

    // delete existing comparisons for capture
    await deleteComparisons(node, client);

    // load comparison capture(s) node data and update comparisons table
    return await Promise.all(
        comparedCaptureIDs.map( async(captureID) => {
            const comparedCapture = await nserve.select(captureID, client);
            // check that image pair(s) are sorted and therefore comparable
            if (await isComparable(
                node.type === 'historic_captures' ? node : comparedCapture,
                node.type === 'historic_captures' ? comparedCapture : node
            )) {
                await upsertComparison(
                    node.type === 'historic_captures' ? node.id : captureID,
                    node.type === 'historic_captures' ? captureID : node.id,
                    client);
            }
            return comparedCapture;
        })
    );
}

/**
 * Upsert comparison.
 *
 * @public
 * @param historicCaptureID
 * @param modernCaptureID
 * @param client
 * @return {Promise} result
 */

export const upsertComparison = async (
    historicCaptureID,
    modernCaptureID,
    client 
) => {

    if (!historicCaptureID || !modernCaptureID) return [];

    let { sql, data } = cmpqueries.upsertComparison(historicCaptureID, modernCaptureID);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows')
            && res.rows.length > 0 ? res.rows : [];
        });
};

/**
 * Delete comparison by ID.
 *
 * @public
 * @param id
 * @param client
 * @return {Promise} result
 */

export const deleteComparison = async (
    id=null,
    client
) => {

    if (!capture1ID || !capture2ID) return [];

    let { sql, data } = cmpqueries.deleteComparison(id);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows') && res.rows.length > 0 ? res.rows : [];
        });
};

/**
 * Delete comparison.
 *
 * @public
 * @param node
 * @param client
 * @return {Promise} result
 */

export const deleteComparisons = async (node, client ) => {

    if (!node) return [];

    let { sql, data } = cmpqueries.deleteCaptureComparisons(node);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows') && res.rows.length > 0 ? res.rows : [];
        });
};

/**
 * Get comparisons (aligned capture pairs) for given station node.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const getComparisonsMetadata = async (node, client) => {

    if (!node) return [];

    const { type = '', id = '' } = node || {};
    const queriesByType = {
        stations: cmpqueries.getComparisonsByStationID(id),
        historic_visits: cmpqueries.getComparisonsByHistoricVisitID(id),
        modern_visits: cmpqueries.getComparisonsByModernVisitID(id),
        locations: cmpqueries.getComparisonsByLocationID(id),
        historic_captures: cmpqueries.getComparisonsData(node),
        modern_captures: cmpqueries.getComparisonsData(node),
    };

    if (queriesByType.hasOwnProperty(type)) {
        let { sql, data } = queriesByType[type];

        // get comparison indices
        const comparisons = await client.query(sql, data)
            .then(res => {
                return res.hasOwnProperty('rows')
                && res.rows.length > 0 ? res.rows : [];
            });

        // get associated capture metadata
        // append full data for each returned capture
        return await Promise.all(
            (comparisons || [])
                // .filter(comparison => comparison)
                .map(async (comparison) => {
                    const historic_data = await nserve.get(
                        comparison.historic_captures, 'historic_captures', client);
                    const modern_data = await nserve.get(
                        comparison.modern_captures, 'modern_captures', client);
                    return {
                        id: comparison.id,
                        historic_captures: historic_data,
                        modern_captures: modern_data
                    };
                }));
    }
    return [];
};

/**
 * Get comparisons for given capture node.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const getComparisonsByCapture = async (node, client ) => {
    let { sql, data } = cmpqueries.getComparisons(node);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows')
            && res.rows.length > 0 ? res.rows : null;
        });
};

/**
 * Check whether capture images are compatible for comparison.
 * - find a common station
 *
 * @public
 * @param historicCapture
 * @param modernCapture
 * @return {Promise} result
 */

export const isComparable = async (historicCapture, modernCapture) => {

    // check if valid file IDs
    if (!historicCapture || !modernCapture) return null;

    // check if correct owner type
    if (
        historicCapture.owner_type !== 'historic_visits'
        || modernCapture.owner_type !== 'locations'
    ) return null;

    // get path of owner node in hierarchy
    const historicPath = await nserve.getPath(historicCapture);
    const modernPath = await nserve.getPath(modernCapture);

    // check that node path exists
    if (!modernPath || !historicPath) return false;

    // get station node
    const historicStationKey = Object.keys(historicPath)
        .find(key => {
            const { node = {} } = historicPath[key] || {};
            const { type = '' } = node || {};
            return type === 'stations';
        });

    // get station node
    const modernStationKey = Object.keys(modernPath)
        .find(key => {
            const { node = {} } = modernPath[key] || {};
            const { type = '' } = node || {};
            return type === 'stations';
        });

    if (!historicStationKey || !modernStationKey) return null;

    const historicStation = historicPath[historicStationKey];
    const modernStation = modernPath[modernStationKey];
    return historicStation.nodes_id === modernStation.nodes_id;
};