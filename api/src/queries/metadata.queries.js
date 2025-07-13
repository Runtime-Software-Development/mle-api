/*!
 * MLP.API.Services.Queries.Metadata
 * File: metadata.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

import * as defaults from './defaults.queries.js';

/**
 * Query: Get all metadata types listed.
 *
 * @return {Object} query binding
 */

export function types() {
    return {
        sql: `SELECT *
              FROM metadata_types;`,
        data: [],
    };
}

/**
 * Query: Retrieve metadata for given item instance.
 *
 * @public
 * @param {integer} id
 * @param {Object} model
 * @return {Function} query function / null if no node
 */

export function select(id, model) {
    const fn = defaults.select(model);
    return fn({id: id});
}

/**
 * Query: Insert metadata entry for given item instance.
 *
 * @param {Object} item
 * @param {Boolean} upsert
 * @return {Function} query function / null if no node
 * @public
 */

export function insert(item, upsert) {
    const fn = defaults.insert(item, upsert);
    return fn(item);
}

/**
 * Query: Update metadata entry for given item instance.
 *
 * @param {Object} item
 * @return {Function} query function / null if no node
 * @public
 */

export function update(item) {
    const fn = defaults.update(item);
    return fn(item);
}

/**
 * Query: Delete metadata entry for given item instance.
 *
 * @param {Object} item
 * @return {Function} query function / null if no node
 * @public
 */

export function remove(item) {
    const fn = defaults.remove(item);
    return fn(item);
}

/**
 * Generate query: Delete group of metadata records from database.
 *
 * @public
 * @param {String} ownerID
 * @param {String} model
 * @param {String} groupType
 * @param {String} groupCol
 * @return {Object} query
 */

export function removeGroup(ownerID, model, groupType, groupCol) {
    let sql = `DELETE FROM ${model} 
            WHERE owner_id = $1::integer
            AND ${groupCol} = $2::varchar
            RETURNING *;`

    return {
        sql: sql,
        data: [ownerID, groupType],
    };
}

/**
 * Query: Get modern captures values by station ID.
 *
 * @return {Object} query binding
 */

export function getModernCapturesByStationID(id) {
    let sql = `
            WITH 
            locs AS (
                SELECT 
                       locations.nodes_id,
                       locations.owner_id
                FROM locations 
                INNER JOIN (
                    SELECT nodes_id
                    FROM modern_visits
                    WHERE owner_id = $1::integer
                ) as mv
                ON mv.nodes_id = locations.owner_id
            )
            SELECT modern_captures.nodes_id, 
                   modern_captures.owner_id
                FROM modern_captures
                    INNER JOIN locs
                        ON modern_captures.owner_id = locs.nodes_id;`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Check if capture has ANY mastered capture images
 *
 * @return {Object} query binding
 */

export function hasMastered(captureID, captureImageType) {
    let sql = `
            WITH 
            captureImages AS (
                SELECT image_state
                FROM ${captureImageType}
                WHERE owner_id = $1::integer
            )
            SELECT COUNT (*) AS total,
            (SELECT COUNT(*) 
                    FROM captureImages 
                    WHERE image_state = 'master' ) as mastered
            FROM captureImages
            ;`;
    return {
        sql: sql,
        data: [captureID],
    };
}

/**
 * Query: Get historic captures for given station.
 *
 * @return {Object} query binding
 */

export function getHistoricCapturesByStationID(id) {
    let sql = `
            SELECT *
            FROM historic_captures
                INNER JOIN (
                    SELECT nodes_id as hv_id FROM historic_visits WHERE owner_id = $1::integer) as hv
                        ON hv_id = historic_captures.owner_id
                        GROUP BY hv_id, historic_captures.nodes_id;
    `;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get historic capture status metadata
 *
 * @param {int} id
 * @return {Object} query binding
 */

export function getHistoricCaptureStatus(id) {
    let sql = `SELECT
                COUNT(DISTINCT cmp.id) as n_comparisons,
                COUNT(DISTINCT hi.files_id) = 0 as missing,
                CASE WHEN COUNT(DISTINCT cmp.id) > 0 then true else false end AS repeated,
                CASE WHEN hv.nodes_id notnull then true else false end AS sorted,
                (COUNT(DISTINCT (
                    CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end) 
                )) > 0 as partial,
                COUNT(DISTINCT (
                    CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end)
                ) = COUNT(DISTINCT cmp.id)
                AND COUNT(DISTINCT (
                    CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end)
                ) = COUNT(DISTINCT hc.nodes_id) as mastered
            FROM historic_captures hc
                LEFT JOIN comparison_indices cmp ON cmp.historic_captures = hc.nodes_id
                LEFT JOIN historic_images hi ON hi.owner_id = hc.nodes_id
                LEFT JOIN historic_visits hv ON hv.nodes_id = hc.owner_id
            WHERE hc.nodes_id = $1::integer
            GROUP BY hc.nodes_id, hv.nodes_id
            LIMIT 1`;
    return {
        sql: sql,
        data: [id],
    };
}


/**
 * Query: Get modern capture status metadata
 *
 * @param {int} id
 * @return {Object} query binding
 */

export function getModernCaptureStatus(id) {
    let sql = `SELECT
                COUNT(DISTINCT cmp.id) as n_comparisons,
                COUNT(DISTINCT mi.files_id) = 0 as missing,
                CASE WHEN COUNT(DISTINCT cmp.id) > 0 then true else false end AS repeated,
                CASE WHEN loc.nodes_id notnull then true else false end AS sorted,
                (COUNT(DISTINCT (
                    CASE WHEN mi.image_state = 'master' AND mi.owner_id = cmp.modern_captures then cmp.modern_captures end) 
                )) > 0 as partial,
                COUNT(DISTINCT (
                    CASE WHEN mi.image_state = 'master' AND mi.owner_id = cmp.modern_captures then cmp.modern_captures end)
                ) = COUNT(DISTINCT cmp.id)
                AND COUNT(DISTINCT (
                    CASE WHEN mi.image_state = 'master' AND mi.owner_id = cmp.modern_captures then cmp.modern_captures end)
                ) = COUNT(DISTINCT mc.nodes_id) as mastered
            FROM modern_captures mc
                LEFT JOIN comparison_indices cmp ON cmp.modern_captures = mc.nodes_id
                LEFT JOIN modern_images mi ON mi.owner_id = mc.nodes_id
                LEFT JOIN locations loc ON loc.nodes_id = mc.owner_id
            WHERE mc.nodes_id = $1::integer
            GROUP BY mc.nodes_id, loc.nodes_id
            LIMIT 1`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Query: Get station status metadata
 * - includes project-based and survey-based stations
 *
 * @param {int} id
 * @return {Object} query binding
 */

export function getStationStatus(id=0) {
    let sql = `SELECT
        stn.nodes_id as nodes_id,
        stn.name as name,
        stn.elev as elev,
        stn.azim as azim,
        stn.lat as lat,
        stn.lng as lng,
        svr.nodes_id as surveyors,
        svy.nodes_id as surveys,
        svs.nodes_id as survey_seasons,
        COUNT(DISTINCT hc.nodes_id)::INT as n_hc,
        COUNT(DISTINCT mc.nodes_id)::INT as n_mc,
        COUNT(DISTINCT cmp.id)::INT as n_comparisons,
        (COUNT(DISTINCT (CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end) ))::INT as hc_mastered,
        (COUNT(DISTINCT (CASE WHEN mi.image_state = 'master' AND mi.owner_id = cmp.modern_captures then cmp.modern_captures end) ))::INT as mc_mastered,
        CASE WHEN COUNT(DISTINCT hc.nodes_id) > 0 AND stn.lat isnull AND stn.lng isnull then true else false end AS grouped,
        CASE WHEN COUNT(DISTINCT hc.nodes_id) > 0 AND stn.lat notnull AND stn.lng notnull then true else false end AS located,
        CASE WHEN COUNT(DISTINCT cmp.id) > 0 then true else false end AS repeated,
        (COUNT(DISTINCT (
            CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end) 
            )) > 0 as partial,
        COUNT(DISTINCT cmp.id) >= COUNT(DISTINCT hc.nodes_id) 
            AND COUNT(DISTINCT (
                    CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end)
                ) = COUNT(DISTINCT cmp.id)::INT
            AND COUNT(DISTINCT (
                    CASE WHEN hi.image_state = 'master' AND hi.owner_id = cmp.historic_captures then cmp.historic_captures end
                )) = COUNT(DISTINCT hc.nodes_id)::INT as mastered
        FROM historic_captures hc
            LEFT JOIN comparison_indices cmp ON cmp.historic_captures = hc.nodes_id
            LEFT JOIN historic_images hi ON hi.owner_id = hc.nodes_id
            LEFT JOIN historic_visits hv ON hv.nodes_id = hc.owner_id
            LEFT JOIN stations stn ON stn.nodes_id = hv.owner_id
            LEFT JOIN survey_seasons svs ON svs.nodes_id = stn.owner_id
            LEFT JOIN surveys svy ON svy.nodes_id = svs.owner_id
            LEFT JOIN surveyors svr ON svr.nodes_id = svy.owner_id
            LEFT JOIN modern_visits mv ON mv.owner_id = stn.nodes_id
            LEFT JOIN locations loc ON loc.owner_id = mv.nodes_id
            LEFT JOIN modern_captures mc ON mc.owner_id = loc.nodes_id
            LEFT JOIN modern_images mi ON mi.owner_id = mc.nodes_id
      WHERE stn.lat notnull AND stn.lng notnull${id ? ` AND stn.nodes_id = $1::integer` : ''}
      GROUP BY stn.nodes_id, svs.nodes_id, svy.nodes_id, svr.nodes_id
      ${id ? 'LIMIT 1' : ''}`;
    return {
        sql: sql,
        data: id ? [id] : [],
    };
}

/**
 * Query: Get all lens types.
 *
 * @return {Object} query binding
 */

export function getLens() {
    return {
        sql: `SELECT *
              FROM lens;`,
        data: [],
    };
}

/**
 * Query: Get node or file label from defined columns.
 *
 * @return {Object} query binding
 */

export function selectLabel(
    id,
    model,
    labelCols=['id'],
    prefix=null,
    delimiter=' ',
    idCol='nodes_id'
) {
    prefix = prefix ? `'${prefix}',` : '';
    return {
        sql: `
            SELECT
                CONCAT_WS('${delimiter}', ${prefix} ${labelCols.join(',')}) AS label
            FROM ${model}
            WHERE ${idCol} = $1::integer;`,
        data: [id],
    };
}

/**
 * Generate query: Find metadata options for given model type.
 *
 * @param {String} model
 * @param {String} valueCol
 * @param {Array} labelCols
 * @param delimiter
 * @return {Function} query function
 * @public
 */

export function selectMetadataOptionsByModel(
    model,
    valueCol='id',
    labelCols = ['id'],
    delimiter=''
) {

    let sql = `SELECT 
                id,
                ${valueCol} AS value, 
                CONCAT_WS('${delimiter}', ${labelCols.join(',')}) AS label
            FROM ${model}`;
    return {
        sql: sql,
        data: [],
    };
}

/**
 * Generate query: Find node options for given model type.
 *
 * @param {String} model
 * @param {Array} labelCols
 * @param {String} delimiter
 * @param {Boolean} hasOwner
 * @return {Object} Query
 * @public
 */

export function selectNodeOptionsByModel(
    model,
    labelCols = ['nodes_id'],
    delimiter='',
    hasOwner=true
) {
    let sql = `SELECT 
                nodes_id as id,
                nodes_id AS value, 
                CONCAT_WS('${delimiter}', ${labelCols.join(',')}) AS label
                ${ hasOwner ? `, owner_id` : ''}
            FROM ${model}`;
    return {
        sql: sql,
        data: [],
    };
}

/**
 * Query: Get all participant group types listed.
 *
 * @return {Object} query binding
 */

export function participantGroupTypes() {
    return {
        sql: `SELECT *
              FROM participant_group_types;`,
        data: [],
    };
}

/**
 * Query: Get participant metadata for given node.
 * - visit participants are only owned by modern visits.
 * - participants are grouped by participant group types defined in 'participant_groups' table
 *
 * @param {String} ownerID
 * @param {String} groupType
 * @return {Object} query binding
 */

export function getParticipantGroups(ownerID, groupType = null) {
    let sql = `
            SELECT
                CONCAT_WS(', ', p.last_name, p.given_names) AS full_name,
                participant_groups.id as pg_id,
                participant_groups.group_type,
                p.last_name,
                p.given_names,
                p.id,
                p.created_at,
                p.updated_at,
                participant_groups.created_at as pg_created_at,
                participant_groups.updated_at as pg_updated_at
            FROM participant_groups
            INNER JOIN participants p ON participant_groups.participant_id = p.id
            WHERE participant_groups.owner_id = $1::integer
            ${groupType ? `AND group_type = $2::varchar` : ''}
            GROUP BY
                    participant_groups.id,
                     participant_groups.group_type,
                     p.last_name, 
                     p.given_names, 
                     p.id,
                     p.created_at,
                     p.updated_at;`;
    return {
        sql: sql,
        data: groupType ? [ownerID, groupType] : [ownerID],
    };
}
