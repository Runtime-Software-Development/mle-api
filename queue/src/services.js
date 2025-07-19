/**
 * @file services.js
 * @description File processing services, including image uploading, resizing, and metadata extraction.
 * @version 3.0.0
 * @license MIT
 */

import pool from './db.js';
import path from 'path';
import { copyImageTo, deleteFiles, extractImageInfo } from './utils.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

// Available image version sizes
export const imageSizes = {
    thumb: 150,
    medium: 900,
    large: 1500,
};

/**
 * Save processed raw image file and resampled (low resolution) versions.
 *
 * @param {Object} file - File data object.
 * @param {Object} file_model - File metadata object.
 * @param {Object} owner - Owner metadata object.
 * @param {Object} client - Database client.
 * @returns {Promise<Object>} - Promise resolving to processing results.
 */
export const uploadImage = async (file, file_model) => {
    try {
        const secureToken = file_model?.secure_token || '';
        const rawFilePath = file?.fs_path;
        const versions = {
            raw: {
                format: 'raw',
                path: path.join(process.env.MLE_UPLOAD_DIR || '', rawFilePath),
                size: null,
            },
            thumb: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_DIR || '', `thumb_${secureToken}.jpeg`),
                size: imageSizes.thumb,
            },
            medium: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_DIR || '', `medium_${secureToken}.jpeg`),
                size: imageSizes.medium,
            },
            large: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_DIR || '', `full_${secureToken}.jpeg`),
                size: imageSizes.large,
            },
        };

        // Path to source temporary file
        const src = path.join(process.env.MLE_TMP_DIR, file?.filename_tmp);

        // Extract image metadata and save it to the file model
        await extractImageInfo(file, file_model, {});

        // Store the metadata in database record
        await updateFileMetadata(file_model, file?.file_type);

        // Copy image original and downscaled versions to MLP library
        await copyImageTo(src, versions.raw);
        await copyImageTo(src, versions.medium);
        await copyImageTo(src, versions.thumb);
        await copyImageTo(src, versions.large);

        // delete temporary files
        await deleteFiles([src]);

        return {
            src,
            versions
        };
    } catch (err) {
        throw err;
    }
};


/**
 * Update file metadata record on database.
 *
 * @param {Object} model      - The model object containing table name, attributes, and idKey.
 * @param {Array} timestamps  - An array of column names that should be updated with NOW().
 * @return {Promise} A promise that takes an item and returns the SQL query and data.
 * @public
 */
export const updateFileMetadata = async (metadata, fileType) => {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {

        // return null if instance is not an image
        if (!['historic_images', 'modern_images', 'supplemental_images'].includes(fileType))
            return null;

        // This ordered list MUST exactly match the order of columns corresponding
        // to placeholders from $2 through $17 in your SQL SET clause.
        const orderedColumnsForPlaceholders = [
            "format",           // $2
            "channels",         // $3
            "density",          // $4
            "space",            // $5
            "x_dim",            // $6
            "y_dim",            // $7
            "bit_depth",        // $8
            "lat",              // $9
            "lng",              // $10
            "elev",             // $11
            "azim",             // $12
            "f_stop",           // $13
            "shutter_speed",    // $14
            "iso",              // $15
            "focal_length",     // $16
            "capture_datetime"  // $17
        ];

        // The data array starts with the value for $1 (which is files_id from item.files_id)
        const data = [metadata.files_id];

        // Populate the rest of the data array based on the strict order defined above.
        orderedColumnsForPlaceholders.forEach(columnName => {
            if (metadata.hasOwnProperty(columnName)) {
                data.push(metadata[columnName]);
            } else {
                // If the property is missing in the item object, push null
                // to ensure the placeholder count in the SQL matches.
                data.push(null);
                // Optionally, log a warning here if you want to be notified about missing data.
                // console.warn(`Warning: Column '${columnName}' missing in item object. Using null.`);
            }
        });

        // Construct the full SQL UPDATE statement
        const sql = `UPDATE ${fileType}
        SET 
            "format" = $2::varchar,
            "channels" = $3::integer,
            "density" = $4::integer,
            "space" = $5::varchar,
            "x_dim" = $6::integer,
            "y_dim" = $7::integer,
            "bit_depth" = $8::integer,
            "lat" = $9::numeric,
            "lng" = $10::numeric,
            "elev" = $11::numeric,
            "azim" = $12::numeric,
            "f_stop" = $13::numeric,
            "shutter_speed" = $14::numeric,
            "iso" = $15::integer,
            "focal_length" = $16::integer,
            "capture_datetime" = $17::timestamp
        WHERE files_id = $1::integer
        RETURNING *;`;

        let response = await client.query(sql, data);
        return response.hasOwnProperty('rows') && response.rows.length > 0
            ? response.rows[0]
            : null;

    } catch (err) {
        console.error(err)
    } finally {
        client.release(true);
    }
}


/**
 * Retrieves camera metadata from the database.
 *
 * @return {Promise<Object>} - Promise resolving to camera metadata object.
 * @public
 */
export const getCameraMetadata = async () => {
    const client = await pool.connect();
    try {
        let sql = `SELECT * FROM cameras`;
        let response = await client.query(sql);
        return response.hasOwnProperty('rows') && response.rows.length > 0 && response.rows;
    } catch (err) {
        console.error(err)
    } finally {
        client.release(true);
    }
}