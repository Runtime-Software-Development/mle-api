/*!
 * MLP.API.Services.Metadata
 * File: metadata.services.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Service module for MLP attached metadata and options data processing.
 *
 * ---------
 * Revisions
 * - 23-07-2023 Included created/updated dates for participant data.
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import pool from './db.services.js';
import queries from '../queries/index.queries.js';
import {groupBy, sanitize} from '../lib/data.utils.js';
import * as cserve from './construct.services.js';
import * as fserve from './files.services.js';
import {getComparisonsMetadata} from './comparisons.services.js';
import {getStatusTypes} from "./schema.services.js";

/**
 * Get metadata by ID. Returns single metadata object.
 *
 * @public
 * @param {String} id
 * @param {String} model
 * @param client
 * @return {Promise} result
 */

export const select = async (id, model, client) => {
    if (!id) return null;
    let { sql, data } = queries.metadata.select(sanitize(id, 'integer'), model);
    let metadata = await client.query(sql, data);
    return metadata.hasOwnProperty('rows') && metadata.rows.length > 0 ? metadata.rows[0] : null;
};

/**
 * Get metadata by name. Returns single metadata object.
 *
 * @public
 * @param {String} model
 * @param value
 * @param client
 * @return {Promise} result
 */

export const selectByName = async (model, value, client) => {
    let { sql, data } = queries.defaults.selectByField(model, 'name', value, 'varchar');
    let metadata = await client.query(sql, data);
    return metadata.hasOwnProperty('rows') && metadata.rows.length > 0
        ? metadata.rows[0]
        : null;
};

/**
 * Get metadata by Owner ID. Returns list of metadata objects.
 *
 * @public
 * @param {String} id
 * @param {String} model
 * @param client
 * @return {Promise} result
 */

export const selectByOwner = async (id, model, client) => {
    if (!id) return null;
    let { sql, data } = queries.defaults.selectByOwner(sanitize(id, 'integer'), model);
    let metadata = await client.query(sql, data);
    return metadata.hasOwnProperty('rows') && metadata.rows.length > 0
        ? metadata.rows
        : null;
};

/**
 * Get grouped metadata.
 *
 * @public
 * @param {String} ownerID
 * @param {String} modelType
 * @param {String} groupType
 * @param client
 * @return {Promise} result
 */

export const getGroup = async function(ownerID, modelType, groupType, client ) {
    let { sql, data } = queries.defaults.getGroup(ownerID, modelType, groupType);
    let items = await client.query(sql, data);
    return items.rows;
};

/**
 * Get group participants metadata.
 *
 * @public
 * @param {String} ownerID
 * @param {String} groupType
 * @param client
 * @return {Promise} result
 */

export const getParticipantGroups = async function(ownerID, groupType, client ) {
    let { sql, data } = queries.metadata.getParticipantGroups(ownerID, groupType);
    let participantGroups = await client.query(sql, data);
    // group by participant group type
    participantGroups = groupBy(participantGroups.rows, 'group_type') || {};
    // return only model type names as list
    if (groupType) return Object.keys(participantGroups).length > 0 ? participantGroups[groupType] : [];
    else return participantGroups;
};

/**
 * Insert metadata entry for provided instance.
 *
 * @param {Object} item
 * @param {Boolean} upsert
 * @param client
 * @return {Function} query function / null if no node
 * @public
 */

export const insert = async(item, upsert=false, client) => {
    let { sql, data } = queries.metadata.insert(item, upsert);
    let response = await client.query(sql, data);
    return response.hasOwnProperty('rows') && response.rows.length > 0
        ? response.rows[0]
        : null;
}

/**
 * Update metadata entry for given item
 *
 * @param {Object} item
 * @param {String} model
 * @param client
 * @return {Function} query function / null if no node
 * @public
 */

export const update = async(item, model, client) => {
    let { sql, data } = queries.metadata.update(item);
    let response = await client.query(sql, data);
    return response.hasOwnProperty('rows') && response.rows.length > 0
        ? response.rows[0]
        : null;
}

/**
 * Update batched metadata entries.
 *
 * @param {Array} newItems
 * @param {String} modelType
 * @param {String} ownerID
 * @param {String} groupType
 * @param {String} idKey
 * @return updated data
 * @public
 */

export const updateGroup = async (newItems, modelType, ownerID, groupType, idKey='id') => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // create participant model constructor
        const ItemModel = await cserve.create(modelType);

        await client.query('BEGIN');

        // get existing participants in group
        const oldItems = await getGroup(ownerID, modelType, groupType, client);

        // delete existing participants not in updated participant list
        const deleted = await Promise.all(
            oldItems
                .filter(pOld =>
                    newItems.length === 0 || newItems.some(pNew =>
                        parseInt(pOld[idKey]) !== parseInt(pNew[idKey])))
                .map(async (pOld) => {
                    return await remove(new ItemModel(pOld), client);
                }));

        // update existing participants in updated participant list
        const upserted = await Promise.all(
            newItems
                .map(async (pNew) => {
                    return await insert(new ItemModel(pNew), true, client);
                }));

        await client.query('COMMIT');

        // return confirmation data
        return {
            deleted: deleted,
            upserted: upserted,
        };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.release(true);
    }
};

/**
 * Delete metadata item from database.
 *
 * @param {Object} item
 * @param client
 * @return {Function} query function / null if no node
 * @public
 */

export const remove = async(item, client) => {
    let { sql, data } = queries.metadata.remove(item);
    let response = await client.query(sql, data);
    return response.hasOwnProperty('rows') && response.rows.length > 0
        ? response.rows[0]
        : null;
}

/**
 * Delete grouped metadata from database.
 *
 * @param {String} ownerID
 * @param {String} modelType
 * @param {String} groupType
 * @param client
 * @return {Function} query function / null if no node
 * @public
 */

export const removeGroup = async (
    ownerID,
    modelType,
    groupType,
    client 
) => {
    let { sql, data } = queries.metadata.removeGroup(ownerID, modelType, groupType, 'group_type');
    let response = await client.query(sql, data);
    return response.hasOwnProperty('rows') && response.rows.length > 0
        ? response.rows[0]
        : null;
};

/**
 * Get all metadata records for given model type.
 *
 * @public
 * @param {String} model
 * @param client
 * @return {Promise} result
 */

export const getAll = async function(model, client) {
    let { sql, data } = queries.defaults.selectByModel(model);
    let items = await client.query(sql, data);
    return items.rows;
};

/**
 * Get metadata options for given model;
 *
 * @public
 * @return {Promise} result
 */

const findMetadataOptions = async (model, valueCol, labelCols, delimiter, client) => {
    let { sql, data } = queries.metadata.selectMetadataOptionsByModel(
        model, valueCol, labelCols, delimiter);
    let metadata = await client.query(sql, data);
    return metadata.rows;
}

/**
 * Get metadata options.
 *
 * @public
 * @return {Promise} result
 */

export const getMetadataOptions = async function(client) {
    return {
        image_states: await findMetadataOptions(
            'image_states', 'name', ['label'], '', client
        ),
        cameras: await findMetadataOptions(
            'cameras','id', ['model'], '', client
        ),
        lens: await findMetadataOptions(
            'lens', 'id', ['brand'], '', client
        ),
        participants: await findMetadataOptions(
            'participants', 'id', ['last_name', 'given_names'], ', ', client
        ),
        participant_group_types: await findMetadataOptions(
            'participant_group_types', 'name', ['label'], '', client
        ),
        image_types: await findMetadataOptions(
            'image_types', 'name', ['label'], '', client
        ),
        metadata_file_types: await findMetadataOptions(
            'metadata_file_types', 'name', ['label'], '', client
        ),
        map_object_types: await findMetadataOptions(
            'map_object_types', 'name', ['label'], '', client
        ),
        map_feature_types: await findMetadataOptions(
            'map_feature_types', 'name', ['label'], '', client
        ),
        surveyors: await findNodeOptions(
            'surveyors',
            ['last_name', 'given_names', 'short_name', 'affiliation'],
            ', ',
            false,
            client
        ),
        survey_seasons: await findNodeOptions(
            'survey_seasons',
            ['year'],
            '',
            true,
            client
        ),
        surveys: await findNodeOptions(
            'surveys',
            ['name'],
            '',
            true,
            client
        ),
        statuses: getStatusTypes(),
        map_objects: await findNodeOptions(
            'map_objects',
            ['name'],
            '',
            false,
            client
        )
    }
};

/**
 * Get representative capture image file data.
 * - filters capture files by image state
 * - rank representative images as masters > interim > misc > raw > gridded
 * - for multiple master images, select the most recent
 *
 * @param files
 * @param owner
 * @return {*}
 */

export const getCaptureImage = (files, owner) => {
    const { historic_images=null, modern_images=null } = files || {};
    const captureImages = historic_images || modern_images || [];
    const { id='', type='' } = owner || {};
    const fileType = type === 'historic_captures' ? 'historic_images' : 'modern_images';
    return captureImages.find(file => file.metadata.image_state === 'master')
        || captureImages.find(file => file.metadata.image_state === 'interim')
        || captureImages.find(file => file.metadata.image_state === 'misc')
        || captureImages.find(file => file.metadata.image_state === 'raw')
        || captureImages.find(file => file.metadata.image_state === 'gridded')
        || {label: 'No Images', file: {file_type: fileType, owner_id: id, owner_type: type }};
}

/**
 * Get node options for given model;
 *
 * @public
 * @return {Promise} result
 */

const findNodeOptions = async (model, labelCols, delimiter, hasOwner, client) => {
    let { sql, data } = queries.metadata.selectNodeOptionsByModel(model, labelCols, delimiter, hasOwner);
    let metadata = await client.query(sql, data);
    return metadata.rows;
}


/**
 * Get metadata global settings.
 *
 * @public
 * @return {Promise} result
 */

export const getAllSettings = async function(client) {
    return {
        library_root_dir: await findMetadataOptions(
            'library_root_dir', 'id', ['label'], '', client),
        user_roles: await findMetadataOptions(
            'user_roles', 'id', ['label'], '', client),
        node_types: await findMetadataOptions(
            'node_types', 'id', ['label'], '', client),
        node_relations: await findMetadataOptions(
            'node_relations','id', ['label'], '', client),
        file_types: await findMetadataOptions(
            'file_types', 'id', ['label'], '', client),
        file_relations: await findMetadataOptions(
            'file_relations', 'id', ['label'], '', client),
        image_types: await findMetadataOptions(
            'image_types', 'id', ['label'], '', client),
        metadata_types: await findMetadataOptions(
            'metadata_types', 'id', ['label'], '', client),
        metadata_relations: await findMetadataOptions(
            'metadata_relations','id', ['label'], '', client),
        views: await findMetadataOptions(
            'views', 'id', ['label'], '', client),
        image_states: await findMetadataOptions(
            'image_states', 'name', ['label'], ', ', client),
        participant_group_types: await findMetadataOptions(
            'participant_group_types', 'id', ['label'], '', client),
        map_objects: await findMetadataOptions(
            'map_objects', 'name', ['label'], '', client)
    }
};

/**
 * Get (any) attached metadata for node.
 *
 * @public
 * @return {Promise} result
 */

export const getAttachedByNode = async function(node, client) {

    const {id=''} = node || {};

    // get participants
    const getParticipantGroups = async (id) => {
        let { sql, data } = queries.metadata.getParticipantGroups(id);
        let participantGroups = await client.query(sql, data);
        // group by participant group type
        participantGroups = groupBy(participantGroups.rows, 'group_type') || {};
        // return only model type names as list
        return Object.keys(participantGroups).length > 0 ? participantGroups : {};
    }

    // get attached data and include labels
    const getAttachedData = async (id, model) => {
        const attachedItems = await selectByOwner(id, model, client) || [];
        return await Promise.all(attachedItems.map( async (item) => {
            return {
                label: await getNodeLabel({id: item.id, type: model}, [], client),
                data: item
            }
        }));
    }

    return {
        glass_plate_listings: await getAttachedData(id, 'glass_plate_listings'),
        maps: await getAttachedData(id, 'maps'),
        participant_groups: await getParticipantGroups(id),
        comparisons: await getComparisonsMetadata(node, client) || []
    }
};

/**
 * Get repeats (modern captures) for given station node.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const getModernCapturesByStation = async (node, client) => {

    const {id=''} = node || {};
    const { sql, data } = queries.metadata.getModernCapturesByStationID(id);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows')
            && res.rows.length > 0 ? res.rows : [];
        });
};

/**
 * Get historic captures for given station node.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const getHistoricCapturesByStation = async (node, client) => {
    const {id=''} = node || {};
    const { sql, data } = queries.metadata.getHistoricCapturesByStationID(id);
    return await client.query(sql, data)
        .then(res => {
            return res.hasOwnProperty('rows')
            && res.rows.length > 0 ? res.rows : [];
        });
};

/**
 * Get filtered station location data and additional context metadata.
 *
 * @public
 * @return {Promise} result
 */

export const getStationStatus = async function (id, client) {

    // get all nodes for station model
    let {sql, data} = queries.metadata.getStationStatus(id);

    // return station results
    return await client.query(sql, data).then(res => {
        return res.rows.length > 0
            ? id ? res.rows[0] || {} : res.rows || []
            : [];
    });

};


/**
 * Get filtered historic capture location data and additional context metadata.
 *
 * @public
 * @return {Promise} result
 */

export const getHistoricCaptureMetadata = async function (id, client) {

        // get all nodes for station model
        let {sql, data} = queries.metadata.getHistoricCaptureStatus(id);
        // return station results
        return await client.query(sql, data).then(res => {
            return res.rows.length > 0
                ? id ? res.rows[0] || {} : res.rows || []
                : [];
        });
};

/**
 * Get filtered modern capture location data and additional context metadata.
 *
 * @public
 * @return {Promise} result
 */

export const getModernCaptureMetadata = async function (id, client) {

    // get all nodes for station model
    let {sql, data} = queries.metadata.getModernCaptureStatus(id);
    // return station results
    return await client.query(sql, data).then(res => {
        return res.rows.length > 0
            ? id ? res.rows[0] || {} : res.rows || []
            : [];
    });
};

/**
 * Get status information for node.
 *
 * Stations:
 * - Station is in the 'Grouped' state. It contains historic captures that have been
 *   grouped together as a single historic station, but the location of this station
 *   has not been estimated.
 * - Station is in the 'Located' state. It contains grouped historic captures and the
 *   location of the station has been estimated. Historic captures have not been repeated.
 * - Station is in the 'Repeated' state. The station contains repeat captures, but at
 *   least one of these captures need to be mastered with its historic capture counterpart
 * - Station is in the 'Partially Mastered' state. The station contains repeat captures
 *   and at least one of them has been mastered, while others still require mastering.
 * - Station is in the 'Mastered' state. The station has been repeated and all of its
 *   captures have been mastered.
 *
 * @public
 * @param {Object} node
 * @param client
 * @return {Promise} result
 */

export const getStatus = async (node, client) => {

    const { id='', type = '' } = node || {};

    // initialize image versions
    const statusInfo = {
        stations: async () => {
            const stationMetadata = await getStationStatus(id, client);
            if (stationMetadata.mastered) return 'mastered';
            if (stationMetadata.partial) return 'partial';
            if (stationMetadata.repeated) return 'repeated';
            if (stationMetadata.located) return 'located';
            if (stationMetadata.grouped) return 'grouped';
            return 'unprocessed';
        },
        historic_captures: async () => {
            const captureMetadata = await getHistoricCaptureMetadata(id, client);
            if (captureMetadata.mastered) return 'mastered';
            if (captureMetadata.partial) return 'partial';
            if (captureMetadata.repeated) return 'repeated';
            if (captureMetadata.missing) return 'missing';
            if (captureMetadata.sorted) return 'sorted';
            return 'unsorted';

        },
        modern_captures: async () => {
            const captureMetadata = await getModernCaptureMetadata(id, client);
            if (captureMetadata.mastered) return 'mastered';
            if (captureMetadata.partial) return 'partial';
            if (captureMetadata.repeated) return 'repeated';
            if (captureMetadata.missing) return 'missing';
            if (captureMetadata.sorted) return 'sorted';
            return 'unsorted';
        },
    };

    // route database callback after file upload
    return statusInfo.hasOwnProperty(type) ? statusInfo[type]() : '';
};

/**
 * Get node label.
 * - Generates labels for nodes based on specific required metadata
 * - For captures, the fn_photo_reference value may be blank, in which case the
 *   use of a capture image filename is used.
 *
 * @public
 * @param {Object} node
 * @param {Array} files
 * @param client
 * @return {Promise} result
 */

export const getNodeLabel = async (node, files=[], client) => {

    if (!node) return [];
    let label = '';

    const {type='', id=null} = node || {};

    const queriesByType = {
        projects: queries.metadata.selectLabel(
            id, type, ['name']
        ),
        surveyors: queries.metadata.selectLabel(
            id, type, ['last_name', 'given_names'], '', ', '
        ),
        surveys: queries.metadata.selectLabel(
            id, type, ['name']
        ),
        survey_seasons: queries.metadata.selectLabel(id, type, ['year']
        ),
        stations: queries.metadata.selectLabel(
            id, type, ['name']
        ),
        historic_visits: queries.metadata.selectLabel(
            id, type, ['date'], 'Historic Visit'
        ),
        modern_visits: queries.metadata.selectLabel(
            id, type, ['date'], ''
        ),
        locations: queries.metadata.selectLabel(
            id, type, ['location_identity'], 'Loc'
        ),
        historic_captures: queries.metadata.selectLabel(
            id, type, ['fn_photo_reference'], ''
        ),
        modern_captures: queries.metadata.selectLabel(
            id, type, ['fn_photo_reference'], ''
        ),
        glass_plate_listings: queries.metadata.selectLabel(
            id, type, ['container', 'plates'], '', ', ', 'id'
        ),
        maps: queries.metadata.selectLabel(
            id, type, ['nts_map'], '', ', ', 'id'
        ),
        map_objects: queries.metadata.selectLabel(
            id, type, ['name'], '', ' '
        ),
        map_features: queries.metadata.selectLabel(
            id, type, ['name'], '', ' '
        ),
    };

    if (queriesByType.hasOwnProperty(type)) {
        let { sql, data } = queriesByType[type];

        // get model label value
        label = await client.query(sql, data)
            .then(res => {
                return res.hasOwnProperty('rows')
                && res.rows.length > 0 ? res.rows[0].label.trim() : '';
            });

        // Handle problematic Surveyor Labels
        if (type === 'surveyors' && label === '') {
            // get model label value
            let { sql, data } = queries.metadata.selectLabel(
                id, type, ['affiliation'], '', ', '
            );
            label = await client.query(sql, data)
                .then(res => {
                    return res.hasOwnProperty('rows')
                    && res.rows.length > 0 ? res.rows[0].label.trim() : '';
                });
        }

        // For captures, check if photo reference label is missing. If so, use
        // an image file name to label the node.
        if (type === 'historic_captures' && label === '') {
            const captureImages = await fserve.selectByOwner(id, client);
            const { historic_images = [] } = captureImages || {};
            label = historic_images.length > 0 ? historic_images[0].label : label || 'Empty Capture';
        }
        if (type === 'modern_captures' && label === '') {
            const captureImages = await fserve.selectByOwner(id, client);
            const {modern_images = []} = captureImages || {};
            label = modern_images.length > 0 ? modern_images[0].label : label || 'Empty Capture';
        }
    }
    return label;
};

