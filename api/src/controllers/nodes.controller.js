/*!
 * MLP.API.Controllers.Nodes
 * File: nodes.controller.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * Description
 * Node route controller. Responsible for control of data transmission between aggregate node data and API response.
 * Maps user action into model updates.
 * - Show: Returns node data by ID
 * - Map: Returns node data for map navigator component
 * - Tree: Returns node data for tree navigator component
 * - Exporter: Exports node data to different formats
 * - Search: Returns search results for full-text queries
 *
 * Revisions
 * - 31-12-2023   Added map objects to navigation tree data
 * - 14-10-2024   Added bulk remover controller
 */

import {prepare} from '../lib/api.utils.js';
import * as nserve from '../services/nodes.services.js';
import * as statserve from '../services/stats.services.js';
import * as expserve from '../services/export.services.js';
import * as srchserve from '../services/search.services.js';
import {sanitize} from '../lib/data.utils.js';
import {json2csv} from '../lib/file.utils.js';
import {Readable} from 'stream';
import pool from '../services/db.services.js';

/**
 * Controller initialization.
 *
 * @src public
 */

export const init = async () => {};

/**
 * Show node data request controller. Does not return dependents.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const show = async (req, res, next) => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        const { id=null } = req.params || {};
        const node = await nserve.select(id, client);

        res.status(200).json(
            prepare({
                view: 'show',
                data: await nserve.get(node.id, node.type, client)
            }));

    } catch (err) {
        return next(err);
    }
    finally {
        client.release();
    }
};

/**
 * Node tree request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const tree = async (req, res, next) => {

    try {

        // get surveyors and projects as root containers
        res.status(200).json(
            prepare({
                view: 'tree',
                data: {
                    nodes: {
                        surveyors: await nserve.getTree('surveyors'),
                        projects: await nserve.getTree('projects'),
                        map_objects: await nserve.getTree('map_objects')
                    },
                    stats: {
                        summary: await statserve.summary()
                    }
                }
            }));

    } catch (err) {
        return next(err);
    }
};

/**
 * Node tree request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const map = async (req, res, next) => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        // get surveyors and projects as root containers
        res.status(200).json(
            prepare({
                view: 'map',
                data: {
                    nodes: await nserve.getMap(client) || []
                }
            }));

    } catch (err) {
        return next(err);
    }
    finally {
        client.release();
    }
};

/**
 * Export node data request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const exporter = async (req, res, next) => {
    try {

        const { format='', schema='default' } = req.params || {};

        // get data using requested export schema
        const exportData = await expserve.get(schema);

        if (!exportData) {
            return next(new Error('invalidRequest'));
        }

        // create file stream
        const filename = `export_${schema}.${format}`;

        // file handlers router indexed by model type
        // Default: JSON data
        const exportHandler = {
            csv: () => {
                res.set('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
                return json2csv(exportData);
            },
            xml: () => {
                res.setHeader("Content-Type", "text/xml");
                res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
                // return json2xml(data);
            },
            default: () => {
                res.setHeader("Content-Type", "text/json");
                res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
                return JSON.stringify(exportData);
            }
        };

        // route database callback after file upload
        const filtered = exportHandler.hasOwnProperty(format)
            ? exportHandler[format]()
            : exportHandler.default();

        // create data stream and pipe to response
        res.on('error', (err) => {
            console.error('Error in write stream:', err);
        });
        let rs = new Readable();
        rs.pipe(res);
        rs.on('error',function(err) {
            console.error(err)
            res.status(404).end();
        });
        rs.push(filtered);
        rs.push(null);

    } catch (err) {
        console.error(err)
        return next(err);
    }
};

/**
 * Retrieves nodes using node ID filter.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const filter = async (req, res, next) => {

    try {

        // get query parameters
        const { ids='', offset=0, limit=10 } = req.query || {};

        // sanitize + convert query string to node id array
        const nodeIDs = ids
            .split(' ')
            .map(id => {
                return sanitize(id, 'integer');
            });

        // get results for each model requested
        const resultData = await nserve.filterNodesByID(nodeIDs, offset, limit);

        res.status(200).json(
            prepare({
                view: 'filter',
                data: resultData
            }));

    } catch (err) {
        return next(err);
    }
};

/**
 * Search nodes using search query.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const search = async (req, res, next) => {
    try {

        // get query parameters
        const { q='', offset=0, limit=10, filter=[] } = req.query || {};

        // get query results
        const resultData = await srchserve.fulltext(q, offset, limit, filter);

        res.status(200).json(
            prepare({
                view: 'search',
                data: resultData
            }));

    } catch (err) {
        return next(err);
    }
};

/**
     * Delete bulk records.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

export const remove = async (req, res, next) => {
    // pool connection
    const client = await pool.connect();
    try {
        const id = this.getId(req);

        // retrieve item data
        let itemData = await nserve.get(id, nodeType, client);

        // item record and/or node/owner not found in database
        if (!itemData || nodeType !== itemData?.type) return next(new Error('notFound'));

        // force user to delete dependent nodes separately
        // - use error code 23503 from FK violation
        if (itemData?.hasDependents) return next(new Error('23503'));

        // delete any capture comparisons if they exist
        const comparisons = await getComparisonsMetadata(itemData?.node, client);
        if (Array.isArray(comparisons) && comparisons.length > 0) {
            await deleteComparisons(itemData?.node, client);
        }

        // get path of owner node in hierarchy (if exists)
        model.setData(itemData.metadata);
        const owner = await nserve.select(model?.ownerID, client);
        const path = await nserve.getPath(owner);

        // delete item (and attached files, if they exist)
        const result = await mserve.remove(model, client);

        res.status(200).json(
            prepare({
                view: 'remove',
                model: model,
                data: result,
                message: {
                    msg: `'${itemData.label}' ${humanize(model.name)} deleted successful!`,
                    type: 'success'
                },
                path: path
            }));

    } catch (err) {
        console.error(err)
        return next(err);
    } finally {
        client.release();
    }
};
