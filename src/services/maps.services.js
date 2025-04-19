/*!
 * MLP.API.Services.Maps
 * File: maps.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

import * as fserve from "./files.services.js";
import fs from "fs";
import JSZip from "jszip";
import {JSDOM} from "jsdom";
import tj from "@mapbox/togeojson";
import pool from "./db.services.js";
import queries from "../queries/index.queries.js";

/**
 * Get map objects data by node ID.
 *
 * @public
 * @param {Array} ids
 * @param client
 * @return {Promise} result
 */

export const getMapFeaturesById = async function (ids, client) {

    // generate prepared statements collated with data
    const { sql, data } = queries.maps.findFeatures(ids);
    let response = await client.query(sql, data);
    // destructure 'row-to-json' SQL row key
    return response.hasOwnProperty('rows') ? response.rows.map(({row_to_json}) => {
        return row_to_json;
    }) || [] : [];

}

/**
 * Get map objects data by node ID.
 *
 * @public
 * @param id
 * @param client
 * @return {Promise} result
 */

export const getMapFeatureById = async function (id, client) {

    // generate prepared statements collated with data
    const { sql, data } = queries.maps.findFeatures([id]);
    let response = await client.query(sql, data);
    // destructure 'row-to-json' SQL row key
    return response.hasOwnProperty('rows') ? response.rows.map(({row_to_json}) => {
        return row_to_json;
    }) || [] : [];

}

/**
 * Extraction methods for GeoJSON by map object type
 *
 * GeoJSON map feature: pointer schema:
 *  {
 *     type: 'Feature',
 *     geometry: { type: 'Point', coordinates: [Array] },
 *     properties: {
 *       name: 'Brown 1954. Bridgland 1922. Cautley 1926',
 *       styleUrl: '#waypoint',
 *       styleHash: '-6bc2ca73',
 *       styleMapHash: [Object],
 *       icon: 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png',
 *       description: 'NTS Mapsheet 82O04 (Banff).',
 *       stroke: '#00aa00',
 *       'stroke-opacity': 1,
 *       'stroke-width': 5
 *     }
 *   }
 *
 *   GeoJSON map feature: grid schema:
 *
 *  {
 *     nodes_id: 0,
 *     name: '30M03 (Niagara)',
 *     type: 'mapsheet',
 *     owner: {
 *       nodes_id: 47532,
 *       name: 'Geodetic Topographic Survey (1-50K)',
 *       type: 'nts',
 *       description: 'Topographic survey.'
 *     },
 *     description: 'Topographic survey.',
 *     geometry: { type: 'LineString', coordinates: [Array] },
 *     points: [ [Object] ]
 *   },
 *
 * @public
 * @param type
 * @param {Object} featuresArray
 * @param {Object} owner
 * @return {{owner: *, nodes_id: *, name: *, description: *, geometry: *, type: string, points}[]}
 */

const extractFeatures = (type, featuresArray, owner) => {

    let featureType;
    switch (type) {
        case 'nts':
            featureType = "mapsheet";
            break;
        case 'boundary':
            featureType = "boundary";
            break;
        default:
            featureType = "other";
    }

    const {metadata} = owner || {};
    const {description} = metadata || {};
    const {features} = featuresArray || {};
    // extract mapsheet markers
    const pointFeatures = (features || []).filter(feature => {
        const {geometry} = feature || {};
        const {type} = geometry || {};
        return type === 'Point';
    });
    // extract mapsheet boundaries
    return (features || []).filter(feature => {
        const {geometry} = feature || {};
        const {type} = geometry || {};
        return type === 'LineString';
    }).map((feature, index) => {
        return {
            nodes_id: index,
            name: feature.properties.name,
            type: featureType,
            owner: metadata,
            description: description,
            geometry: ([feature.geometry]).concat((pointFeatures || [])
                .filter(point => String(point.properties.description).includes(feature.properties.name))
                .map(point => point.geometry))
        }
    });
}

/**
 * Get map objects data by node ID.
 *
 * @public
 * @param file
 * @param owner
 * @return {Promise} result
 */

export const extractMapFeaturesFromFile = async function (file, owner) {

    // get absolute file path
    const kmzFilePath = fserve.getFilePath(file);
    // check that file exists
    if (fs.existsSync(kmzFilePath)) console.log('File exists', kmzFilePath);
    // buffer kmz file as binary data
    const dataBuffer = await fs.promises.readFile(kmzFilePath);
    const zip = await JSZip.loadAsync(dataBuffer);
    const kmlDom = [];
    // extract KML Dom read from buffer
    zip.forEach(function (path, file) {
        kmlDom.push(file.async('string'));
    });
    let result = []
    // extract and convert features from each uncompressed KML file to GeoJSON format
    await Promise.all(kmlDom.map(async (data) => {
        // convert to JSDOM
        const dom = new JSDOM(await data);
        // convert DOM to geoJSON
        const featuresArray = tj.kml(dom.window.document, {styles: false});
        // extract features for given map object type
        const {metadata} = owner || {};
        const {type} = metadata || {};
        // console.log(extractFeatures[type](featuresArray, owner))
        const features = extractFeatures(type, featuresArray, owner);
        result = result.concat.apply(features);

    }));
    return result;
}


/**
 * Get map objects data by node ID.
 *
 * @public
 * @param features
 * @param owner
 * @return {Promise} result
 */

export const insertMapFeatures = async function (features, owner) {

    const client = await pool.connect();

    try {
        // generate prepared statements collated with data
        const { sql, data } = queries.maps.insertFeatures(features, owner);
        // DEBUG
        // console.log(sql, data)
        // return []
        let response = await client.query(sql, data);
        return response.hasOwnProperty('rows') ? response.rows || [] : [];

    } catch (err) {
        throw err;
    } finally {
        await client.release(true);
    }
}