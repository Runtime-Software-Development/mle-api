/*!
 * MLP.API.Controllers.Maps
 * File: maps.controller.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Maps data controller.
 *
 * ---------
 * Revisions

 */

import * as fserve from '../services/files.services.js';
import * as nserve from '../services/nodes.services.js';
import {prepare} from '../lib/api.utils.js';
import pool from '../services/db.services.js';
import {
    extractMapFeaturesFromFile,
    insertMapFeatures,
    getMapFeaturesById,
    getMapFeatureById
} from "../services/maps.services.js";
import {sanitize} from "../lib/data.utils.js";

/**
 * Controller initialization.
 *
 * @src public
 */

export const init = async () => {
};

/**
 * Request showcase capture data (frontpage image carousel)
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */



/**
 * Extract map features from KMZ files request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const extractMapFeatures = async (req, res, next) => {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        // get file ID from parameters
        const { id = null } = req.params || {};

        // get owner metadata record
        const {file} = await fserve.get(id, client) || {};
        const {owner_id} = file || {};
        const owner = await nserve.get(owner_id, 'map_objects', client);

        // check that id exists
        if (!owner) {
            return next(new Error('invalidRequest'));
        }

        // get filtered results
        const resultData = await extractMapFeaturesFromFile(file, owner);

        res.status(200).json(
            prepare({
                view: 'extract',
                model: 'map_features',
                data: resultData,
                message: {
                    msg: `Map features extracted successfully!`,
                    type: 'success'
                }
            }));

    } catch (err) {
        console.error(err)
        return next(err);
    } finally {
        await client.release(true);
    }
};

/**
 * Generate map features from KMZ files request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const createMapFeatures = async (req, res, next) => {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        // get owner ID from parameters
        const { id = null } = req.params || {};

        const featuresData = req.body || [];

        // get owner metadata record
        const owner = await nserve.get(id, 'map_objects', client);

        // check if request data exists and is valid
        if (!owner) return next(new Error('notFound'));
        if (!Array.isArray(featuresData) || featuresData.length === 0) return next(new Error('invalidRequest'));

        // insert map features as map object dependents
        // NOTE: duplicates will throw error message
        const results = await insertMapFeatures(featuresData, owner);

        // compose response message
        const message = 'Map Features Generated: ' + (featuresData || []).map(({name}) => {
                const match = results.some(item => item.hasOwnProperty('name') && item.name === name);
                return match ? `${name} added` : `${name} not added (duplicate)`
            }).join(', ');

        res.status(200).json(
            prepare({
                view: 'extract',
                model: 'map_features',
                data: results,
                message: {
                    msg: message,
                    type: 'success'
                }
            }));

    } catch (err) {
        console.error(err)
        return next(err);
    } finally {
        await client.release(true);
    }
};

/**
 * Get all map features.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const getMapFeatures = async (req, res, next) => {

    // get query parameters
    const { ids=''} = req.query || {};

    // sanitize + convert query string to node id array
    const mapFeatureIDs = ids
        .split(' ')
        .map(id => {
            return sanitize(id, 'integer');
        })
        .filter(Number);

    const client = await pool.connect();
    try {
        res.status(200).json(
            prepare({
                view: 'map_features',
                model: 'map_features',
                data: await getMapFeaturesById(mapFeatureIDs, client)
            }));

    } catch (err) {
        console.error(err)
        return next(err);
    } finally {
        await client.release(true);
    }
};

