/*!
 * MLP.API.Services.Schema
 * File: schema.services.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * Description
 * Schema services are helper utilities to construct models using the MLP schema.
 *
 * Revisions
 * - 31-12-2023   Added map objects as root
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import pool from './db.services.js';
import queries from '../queries/index.queries.js';
import {groupBy, humanize} from '../lib/data.utils.js';
import { participantGroupTypes } from '../queries/metadata.queries.js';

/**
 * Export schema constructor. A schema instance is a
 * wrapper to encapsulate the data model.
 *
 * @public
 * @param {String} constructorType
 * @return {Object} constructor
 */

export const create = async (constructorType) => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        // initialize db schema attributes
        const nodeTypes = await getNodeTypes(client);
        const metadataTypes = await getMetadataTypes(client);
        const fileTypes = await getFileTypes(client);
        const permissions = await getPermissions(client);
        const attributes = await getAttributes(constructorType, client);
        const nodeAttributes = await getAttributes('nodes', client);
        const fileAttributes = await getAttributes('files', client);

        // check type definition in db. The 'nodes' model includes all
        // data containers (e.g. historic visits); the 'files'
        // model handles all nodes attached to files in the library
        // (e.g. historic images).
        if (
            !(nodeTypes.includes(constructorType)
                || fileTypes.includes(constructorType)
                || metadataTypes.includes(constructorType)
                || constructorType === 'nodes'
                || constructorType === 'files')
        )
            throw Error('invalidConstructorType');

        // set identifier key based on model attributes.
        const idKey = (attributes == null || attributes.hasOwnProperty('files_id'))
            ? 'files_id'
            : attributes.hasOwnProperty('nodes_id')
                ? 'nodes_id'
                : 'id';

        // construct schema for model type
        let Schema = function() {
            this.model = constructorType;
        };

        // define model properties
        Object.defineProperties(Schema.prototype, {
            nodeTypes: {
                value: nodeTypes,
                writable: false
            },
            metadataTypes: {
                value: metadataTypes,
                writable: false
            },
            fileTypes: {
                value: fileTypes,
                writable: false
            },
            attributes: {
                value: attributes || [],
                writable: true
            },
            nodeAttributes: {
                value: nodeAttributes || [],
                writable: true
            },
            fileAttributes: {
                value: fileAttributes || [],
                writable: true
            },
            idKey: {
                value: idKey,
                writable: false
            },
            permissions: {
                value: permissions[constructorType],
                writable: false
            },
            rootNodeTypes: {
                value: ['projects', 'surveyors', 'map_objects'],
                writable: false
            },
            fsRoot: {
                value: {
                    projects: 'Organized_by_Projects',
                    surveyors: 'Organized_by_Surveyor',
                    map_objects: 'Map_Objects'
                },
                writable: false
            },
            nodeDepth: {
                value: {
                    'projects': 0,
                    'surveyors': 0,
                    'surveys': 0,
                    'survey_seasons': 1,
                    'default': 2
                },
                writable: false
            }
        });
        return Schema;

    } catch (err) {
        console.error(err)
        throw Error(err);
    } finally {
        client.release(true);
    }
};

/**
 * Get all node types.
 *
 * @public
 * @return {Promise} result
 */

export const getNodeTypes = async function(client) {
    let { sql, data } = queries.nodes.types();
    let nodeTypes = await client.query(sql, data);

    // return only model type names as list
    return nodeTypes.rows.map(nodeType => { return nodeType.name });
};

/**
 * Check that node is relatable to given owner.
 *
 * @public
 * @param nodeID
 * @param ownerID
 * @param client
 * @return {Promise} result
 */

export const isRelatable = async function(nodeID, ownerID, client) {
    let { sql, data } = queries.schema.isRelatable(nodeID, ownerID);
    const res = await client.query(sql, data);
    return res.rows.length > 0 && res.rows[0].exists;
};

/**
 * Get all metadata types.
 *
 * @public
 * @return {Promise} result
 */

export const getMetadataTypes = async function(client) {
    let { sql, data } = queries.metadata.types();
    let nodeTypes = await client.query(sql, data);

    // return only model type names in list
    return nodeTypes.rows.map(nodeType => { return nodeType.name });
};

/**
 * Get all participant group types.
 *
 * @public
 * @return {Promise} result
 */

export const getParticipantGroupTypes = async function(client) {
    let { sql, data } = participantGroupTypes();
    let pgTypes = await client.query(sql, data);

    // return only participant group type in list
    return pgTypes.rows.map(pgType => { return pgType.name });
};

/**
 * Get all file types.
 *
 * @public
 * @return {Promise} result
 */

export const getFileTypes = async function(client) {
    let { sql, data } = queries.files.types();
    let fileTypes = await client.query(sql, data);

    // return only model type names as list
    return fileTypes.rows.map(fileType => { return fileType.name });
};

/**
 * Get owner type for given file type.
 * Allows looking up owner type by file type or file type by owner type.
 *
 * @public
 * @return {Promise} result
 */

export const getFileOwnerType = async function(client) {
    let { sql, data } = queries.files.relations();
    let fileRelations = await client.query(sql, data);

    // return only model type names as list
    return {
        'files': groupBy(fileRelations.rows, 'dependent_type'),
        'nodes': groupBy(fileRelations.rows, 'owner_type')
    };
};

/**
 * Find and format schema attributes for given model or reference type.
 *
 * @public
 * @param {String} type
 * @param client
 * @return {Promise} result
 */

export const getAttributes = async function(type, client) {

    if (type == null) return null;

    // get model attributes (table columns)
    let {sql, data} = queries.schema.getColumns(type);
    const attrs = await client.query(sql, data);

    // no attributes found
    if (attrs.rows.length === 0) return null;

    // index attributes by their names
    return attrs.rows
        .reduce((o, x) => {
            (o[x.col] = {
                value: null,
                key: x.col,
                label: humanize(x.col),
                type: x.data_type,
                ref: x.ref_table
                // refId: x.ref_col
            } || []);
            return o;
        }, {});
};

/**
 * Get user permissions. Returns object with user role restrictions
 * indexed by model type.
 *
 * @public
 * @return {Promise} result
 */

export const getPermissions = async function(client) {
    let { sql, data } = queries.users.getPermissions();
    let permissions = await client.query(sql, data);
    return permissions.rows;
};

/**
 * Get station status types.
 *
 * @public
 * @return {Array} result
 */

export const getStatusTypes = function() {
    return [
        {value: 'grouped', label: 'Grouped'},
        {value: 'located', label: 'Located'},
        {value: 'repeated', label: 'Repeated'},
        {value: 'partial', label: 'Partial'},
        {value: 'mastered', label: 'Mastered'}
    ]
}

/**
 * Generate instance label from attributes.
 *
 * @param model
 * @param {Object} attributes
 * @src public
 */

export function genLabel(model, attributes = null) {
    if (!model || !attributes) return '';
    const labelByModel = {
        projects: ['name'],
        surveyors: ['last_name', 'given_names', 'short_name', 'affiliation'],
        surveys: ['name'],
        survey_seasons: ['year'],
        stations: ['name'],
        historic_visits: 'Historic',
        modern_visits: ['date'],
        locations: ['location_identity'],
        historic_captures: ['fn_photo_reference'],
        modern_captures: ['fn_photo_reference'],
        glass_plate_listings: ['container', 'plates'],
        maps: ['nts_map'],
        map_objects: ['name'],
        map_features: ['name'],
        historic_images: ['fn_photo_reference'],
        modern_images: ['fn_photo_reference'],
        supplemental_images: ['fn_photo_reference'],
    };

    return labelByModel.hasOwnProperty(model)
        ? Array.isArray(labelByModel[model])
            ? labelByModel[model].map(key => {
            return attributes[key];
        }).join(' ').trim() || humanize(model)
            : labelByModel[model]
        : '';
}