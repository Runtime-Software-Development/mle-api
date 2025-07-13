/*!
 * MLP.API.Services.Queries.Maps
 * File: maps.queries.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Generate query: Get all map features
 *
 * @return {Object} query
 * @public
 */


export function findFeatures(ids=[]) {
    // build id filter statement
    // - convert id array to SQL array string
    const idArray =  ids.map((_, index) => {return `$${++index}::integer`}).join(', ');
    // create json map feature query
    return {
        sql: `SELECT row_to_json(expanded_map_features)
              FROM (
                    SELECT
                map_features.*,
                map_objects.nodes_id as map_object_id,
                map_objects.name as map_object_name,
                map_objects.description as map_object_description,
                map_objects.type as map_objects_type,
                    (
                        SELECT jsonb_agg(nested_maps)
                FROM (
                    SELECT 
                        maps.*, 
                        survey_seasons.year AS survey_season,
                        survey_seasons.nodes_id AS survey_season_id,
                        surveys.name AS survey,
                        surveys.nodes_id AS survey_id,
                        CONCAT(surveyors.given_names, ' ', surveyors.last_name, ' ', surveyors.short_name, ' ', surveyors.affiliation) AS surveyor,
                        surveyors.nodes_id AS surveyor_id
                    FROM maps
                    JOIN survey_seasons ON survey_seasons.nodes_id = maps.owner_id
                    JOIN surveys ON surveys.nodes_id = survey_seasons.owner_id
                    JOIN surveyors ON surveyors.nodes_id = surveys.owner_id
                    WHERE maps.map_features_id = map_features.nodes_id
                ) AS nested_maps
               ) AS dependents
              FROM map_features
              JOIN map_objects ON map_objects.nodes_id = map_features.owner_id
              ${idArray ? `WHERE map_features.nodes_id IN (${idArray})` : ''}
            ) AS expanded_map_features;`,
        data: ids || []
    }
}

/**
 * Generate query: Insert node entry for given item
 * data format:
 *  [..., {
 *     name: '82F01 (Yahk)',
 *     geometry: [ [Object], [Object] ],
 *     type: 'mapsheet',
 *     description: 'Topographic survey.'
 *   }, ... ]
 *   owner format:
 *   <Map Object Model>
 *
 * @return {Object} query
 * @public
 * @param {Array} data
 * @param {Object} owner
 */

export function insertFeatures(data, owner) {

    // get owner id
    const {node} = owner || {};
    const {id} = node || {};

    // create placeholder strings in format "($1::<format>, $2::<format>, $3::<format>, ...), ..."
    const nodeStr = (data || []).map((_, index) => {
        return `('map_features', $1::integer, 'map_objects', NOW(), NOW())`;
    }).join(',');
    const featuresStr = (data || []).map((_, index) => {
        return `(
                $1::integer, 
                $${index * 4 + 2}::varchar, 
                $${index * 4 + 3}::varchar, 
                $${index * 4 + 4}::text,
                $${index * 4 + 5}::json
                )`;
    }).join(',');

    // create values array to pass to placeholders
    let valueArr = data.reduce((o, {name, type, description, geometry}) => {
        return o.concat([name, type, description, JSON.stringify(geometry)]);
    }, [id]);

    return {
        sql: `WITH mf_node_ids AS (
                   INSERT INTO nodes (type, owner_id, owner_type, created_at, updated_at)
                   VALUES ${nodeStr}
                   RETURNING id
                ),
                m_features AS (
                    SELECT *
                        FROM ( VALUES ${featuresStr} ) AS feature_data(owner_id, name, type, description, geometry)
                ),
                collated_features AS (
                    SELECT *
                    FROM(
                        SELECT *, row_number() over (order by id) as row_num
                        FROM mf_node_ids) A
                    JOIN
                        (SELECT *,row_number() over (order by name) as row_num
                        FROM m_features) B
                    on  A.row_num=B.row_num
                    ORDER BY A.id
                )
                INSERT INTO map_features (nodes_id, owner_id, name, type, description, geometry)
                        SELECT collated_features.id,
                        collated_features.owner_id,
                        collated_features.name,
                        collated_features.type,
                        collated_features.description,
                        CAST(collated_features.geometry AS json)
                        FROM collated_features
                    RETURNING *;`,
        data: valueArr
    }
}


/**
 * Generate query: Delete node entry for given item
 *
 * @return {Function} query function / null if no node
 * @public
 * @param {Array} ids
 */

export function removeFeatures(ids) {
    return null
}