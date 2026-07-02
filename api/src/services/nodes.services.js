/*!
 * MLP.API.Services.Nodes
 * File: nodes.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import pool from './db.services.js';
import queries from '../queries/index.queries.js';
import {mapToObj, sanitize} from '../lib/data.utils.js';
import * as mserve from './metadata.services.js';
import {getCaptureImage, getStatus} from './metadata.services.js';
import * as fserve from './files.services.js';
import {getFileLabel} from './files.services.js';

const LEAF_NODE_TYPES = new Set([
    'historic_captures',
    'modern_captures',
    'locations',
    'map_features',
    'glass_plate_listings',
]);

const DEBUG_NODE_TIMINGS = process.env.MLE_DEBUG_NODE_TIMINGS === 'true';

const timingMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;


/**
 * Get node by ID. Returns single node object.
 *
 * @public
 * @param {integer} id
 * @param client
 * @return {Promise} result
 */

export const select = async (id, client) => {
    if (!id) return null;
    let { sql, data } = queries.nodes.select(id);
    let node = await client.query(sql, data);
    return node.hasOwnProperty('rows') && node.rows.length > 0
        ? node.rows[0]
        : null;
};

/**
 * Get model data by node reference. Returns single metadata object.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const selectByNode = async (node, client) => {
    let { sql, data } = queries.defaults.selectByNode(node);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows')
            && res.rows.length > 0 ? res.rows[0] : null;
        });
};

/**
 * Get node + data + dependents by ID. Returns single node object.
 *
 * @public
 * @param {integer} id
 * @param type
 * @param client
 * @return {Promise} result
 */

export const get = async (id, type, client, options = {}) => {

    const { includeDependents = true, dependentOptions = {} } = options;

        const startedAt = process.hrtime.bigint();
        let selectMs = 0;
        let metadataMs = 0;
        let filesMs = 0;
        let statusMs = 0;
        let dependentsMs = 0;
        let hasDepsMs = 0;
        let labelMs = 0;

        if (!id) return null;

        // get requested node by ID
        let t = process.hrtime.bigint();
        const node = await select(id, client);
        selectMs = timingMs(t);

        // check that node exists and node type matches
        if (!node || type !== node.type) return null;

        const isLeafType = LEAF_NODE_TYPES.has(node.type);

        t = process.hrtime.bigint();
        const metadata = await selectByNode(node, client);
        metadataMs = timingMs(t);

        t = process.hrtime.bigint();
        const files = await fserve.selectByOwner(id, client);
        filesMs = timingMs(t);

        t = process.hrtime.bigint();
        const status = await getStatus(node, client);
        statusMs = timingMs(t);

        let dependents = [];
        let hasDeps = false;
        const needsDependents = !isLeafType;
        if (needsDependents && includeDependents) {
            t = process.hrtime.bigint();
            dependents = await selectByOwner(id, client, dependentOptions);
            dependentsMs = timingMs(t);
        }
        if (needsDependents) {
            t = process.hrtime.bigint();
            hasDeps = await hasDependents(id, client);
            hasDepsMs = timingMs(t);
        }

        t = process.hrtime.bigint();
        const label = await mserve.getNodeLabel(node, files || [], client);
        labelMs = timingMs(t);

        if (DEBUG_NODE_TIMINGS) {
            console.info('[nodes.get] timings_ms', {
                id,
                type,
                includeDependents,
                select: Number(selectMs.toFixed(2)),
                metadata: Number(metadataMs.toFixed(2)),
                files: Number(filesMs.toFixed(2)),
                status: Number(statusMs.toFixed(2)),
                dependents: Number(dependentsMs.toFixed(2)),
                hasDependents: Number(hasDepsMs.toFixed(2)),
                label: Number(labelMs.toFixed(2)),
                total: Number(timingMs(startedAt).toFixed(2)),
            });
        }

        // append model data, files and dependents (child nodes)
        return {
            type: node.type,
            node: node,
            metadata: metadata,
            label: label,
            files: files || [],
            refImage: getCaptureImage(files || [], node),
            dependents: dependents || [],
            hasDependents: hasDeps,
            status: status,
        }
};

/**
 * Get filtered stations data for map navigation.
 *
 * @public
 * @return {Promise} result
 */

export const getMap = async function(client) {

    // console.log('getMap: stations... ');

        // get all nodes for model
        let { sql, data } = queries.metadata.getStationStatus();
        let stations = await client.query(sql, data)
            .then(res => {
                return res.rows
            });

        // console.log('getMap: stations', stations);

        // set station status
        return stations.map(station => {
            if (station.mastered) station.status = 'mastered';
            else if (station.partial) station.status = 'partial';
            else if (station.repeated) station.status =  'repeated';
            else if (station.located) station.status =  'located';
            else if (station.grouped) station.status =  'grouped';
            else station.status = 'unprocessed';
            return station;
        })
}

/**
 * Get all nodes for top-level node tree. Includes dependents data.
 *
 * @public
 * @param {String} model
 * @return {Promise} result
 */

export const getTree = async function(model) {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // get all nodes for model
        let { sql, data } = queries.nodes.selectByModel(model);
        let nodes = await client.query(sql, data)
            .then(res => {
                return res.rows
            });

        // Enrich each root node sequentially on the same client connection.
        const items = [];
        for (const node of nodes) {
            const metadata = await selectByNode(node, client);
            const hasDeps = await hasDependents(node.id, client);
            const status = await getStatus(node, client);
            const label = await mserve.getNodeLabel(node, [], client);
            items.push({
                id: node?.id,
                node: node,
                label: label,
                type: node.type,
                metadata: metadata,
                hasDependents: hasDeps || false,
                status: status,
            });
        }

        // return nodes
        return items;

    } catch (err) {
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Get referenced child node(s) by parent ID value.
 * Use within a client transaction.
 *
 * @public
 * @param {integer} id
 * @param client
 * @return {Promise} result
 */

export const selectByOwner = async (id, client, options = {}) => {

    const { includeFiles = true, includeStatus = true } = options;

    id = sanitize(id, 'integer');

    // get dependent nodes for owner
    let { sql, data } = queries.nodes.selectByOwner(id);
    let nodes = await client.query(sql, data)
        .then(res => {
            return res.rows
        });

    // Enrich each dependent node sequentially on the same client connection.
    const enrichedNodes = [];
    for (const node of nodes) {
        const metadata = await selectByNode(node, client);
        const files = includeFiles
            ? await fserve.selectByOwner(node.id, client)
            : [];
        const hasDeps = await hasDependents(node.id, client);
        const status = includeStatus
            ? await getStatus(node, client)
            : '';
        const label = await mserve.getNodeLabel(node, [], client);
        enrichedNodes.push({
            id: node?.id,
            model: node.type,
            node: node,
            label: label,
            type: node.type,
            metadata: metadata,
            files: files,
            refImage: getCaptureImage(files, node),
            hasDependents: hasDeps,
            status: status,
        });
    }
    nodes = enrichedNodes;

    // return nodes
    return nodes;

};


/**
 * Get list of requested nodes by IDs.
 *
 * @public
 * @params {Object} inputNode
 * @return {Promise} result
 */

export const filterNodesByID = async (nodeIDs, offset, limit) => {

    if (!nodeIDs) return null;

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

        // get filtered nodes
        let { sql, data } = queries.nodes.filterByIDArray(nodeIDs, parsedOffset, parsedLimit);
        let nodes = await client.query(sql, data)
            .then(res => {
                return res.rows
            });

        const count = nodes.length > 0 ? nodes[0].total : 0;

        // append model data; /filter does not need full dependent subtree expansion
        const items = [];
        for (const node of nodes) {
            items.push(await get(node.id, node.type, client, { includeDependents: false }));
        }

        return {
            query: nodeIDs,
            limit: parsedLimit,
            offset: parsedOffset,
            results: items,
            count: count
        };

    } catch (err) {
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Check if node has dependent nodes.
 *
 * @public
 * @param {integer} id
 * @param client
 * @return {Promise}
 */

const hasDependents = async function(id, client) {
    let { sql, data } = queries.nodes.hasDependent(id);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows') && res.rows.length > 0
                ? res.rows[0].exists
                : false;
    });
};

/**
 * Find node path in tree for given node.
 *
 * @public
 * @params {Object} inputNode
 * @return {Promise} result
 */

export const getPath = async (inputNode) => {

    if (!inputNode) return null;

    // make shallow copy of node
    const node = Object.assign({}, inputNode);

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // initialize node path map
        let nodePath = new Map();
        // check if leaf is a file
        const isFile = node.hasOwnProperty('file_type');
        // destructure node data
        let { owner_id = null, id=null } = node || {};
        // limit traversal of node tree to 9 iterations
        let end = 9;
        // node tree branch counter
        let n = 1;

        // get current item data (if item exists)
        let leafNode = isFile
            ? {
                file: node,
                metadata: await fserve.selectByFile(node, client) || {},
                label: await getFileLabel(node, client)
            }
            : {
                node: node,
                metadata: await selectByNode(node, client) || {},
                label: await mserve.getNodeLabel(node, [], client)
            }

        // set leaf node of tree
        nodePath.set(0, leafNode);

        // follow owners up the node tree hierarchy
        do {
            // get owner node
            if (owner_id) {

                const parentNode = await select(owner_id, client) || {};

                // append new node to path
                let newNode = {};
                newNode.node = parentNode;
                newNode.metadata = await selectByNode(parentNode, client) || {};
                newNode.label = await mserve.getNodeLabel(parentNode, [], client);
                nodePath.set(n, newNode);

                // reset node iteration
                id = owner_id;
                owner_id = parentNode.owner_id;
            }
            n++;
        } while (id && n < end);

        // return node path as JS object
        return mapToObj(nodePath);

    } catch (err) {
        throw err;
    } finally {
        client.release();
    }
};
