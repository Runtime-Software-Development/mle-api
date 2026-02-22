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

    const { metadata } = owner || {};
    const { description } = metadata || {};
    const { features } = featuresArray || {};

    // 1. Extract Point features (markers)
    const pointFeatures = (features || []).filter(feature => 
        feature?.geometry?.type === 'Point'
    );

    // 2. Extract Boundary features (Now includes Polygons and LineStrings)
    return (features || []).filter(feature => {
        const gType = feature?.geometry?.type;
        // Added 'Polygon' to the allowed types
        return gType === 'LineString' || gType === 'Polygon';
    }).map((feature, index) => {
        // Find associated points based on description matching the name
        const associatedPoints = pointFeatures
            .filter(point => String(point.properties?.description || "").includes(feature.properties.name))
            .map(point => point.geometry);

        return {
            nodes_id: index,
            name: feature.properties.name || `Feature ${index}`,
            type: featureType,
            owner: metadata,
            description: description,
            // Consolidate the main geometry (Polygon/Line) with the associated Points
            geometry: [feature.geometry, ...associatedPoints]
        };
    });
};

/**
 * Get map objects data by node ID.
 *
 * @public
 * @param file
 * @param owner
 * @return {Promise} result
 */

export const extractMapFeaturesFromFile = async function (file, owner) {
    const kmzFilePath = fserve.getFilePath(file);

    // 1. Check if file exists
    if (!fs.existsSync(kmzFilePath)) {
        throw new Error(`File not found at path: ${kmzFilePath}`);
    }

    try {
        const dataBuffer = await fs.promises.readFile(kmzFilePath);
        const zip = await JSZip.loadAsync(dataBuffer);
        
        const kmlPromises = [];

        // 2. Filter for KML files only
        zip.forEach((path, zipEntry) => {
            if (path.toLowerCase().endsWith('.kml')) {
                kmlPromises.push(zipEntry.async('string'));
            }
        });

        if (kmlPromises.length === 0) {
            throw new Error('No valid KML files found within the KMZ archive.');
        }

        const kmlStrings = await Promise.all(kmlPromises);
        let allFeatures = [];

        // 3. Process each KML file found
        for (const kmlData of kmlStrings) {
            const dom = new JSDOM(kmlData);
            const geoJson = tj.kml(dom.window.document, { styles: false });

            // Basic validation of the parsed GeoJSON
            if (!geoJson || !geoJson.features) {
                throw new Error('Failed to parse KML content into GeoJSON.');
            }

            const { metadata } = owner || {};
            const { type } = metadata || {};

            // Extract features based on your helper function
            const extracted = extractFeatures(type, geoJson, owner);
            
            if (Array.isArray(extracted)) {
                allFeatures = [...allFeatures, ...extracted];
            }
        }

        return allFeatures;

    } catch (error) {
        // 4. Re-throw errors with context so the UI/caller can handle them
        throw new Error(`Failed to process KMZ file: ${error.message}`);
    }
};


/**
 * Insert map features into database.
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
        let response = await client.query(sql, data);
        return response.hasOwnProperty('rows') ? response.rows || [] : [];

    } catch (err) {
        throw err;
    } finally {
        client.release(true);
    }
}