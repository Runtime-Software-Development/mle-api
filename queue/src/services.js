/**
 * @file services.js
 * @description File processing services, including image uploading, resizing, and metadata extraction.
 * @version 3.0.0
 * @license MIT
 */

import { mkdir } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { copyImageTo, deleteFiles, extractImageInfo } from './utils.js'; // Assuming data.utils.js exports sanitize
import { updateFileMetadata } from './api.js';
import dotenv from 'dotenv';
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
        const rawDirPath = path.dirname(rawFilePath);

        // Ensure the upload and low resolution images directory exists
        if (!fs.existsSync(process.env.MLE_UPLOAD_DIR)) {
            throw new Error('Upload directory does not exist');
        }

        if (!fs.existsSync(process.env.MLE_LOWRES_DIR)) {
            throw new Error('Low resolutuion images directory does not exist');
        }

        // Ensure file path is valid
        if (!fs.existsSync(rawFilePath)) {
            await mkdir(rawDirPath, { recursive: true });
        }

        const versions = {
            raw: {
                format: 'raw',
                path: path.join(process.env.MLE_UPLOAD_DIR || '', path.dirname(rawFilePath)),
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

        const src = file?.filename_tmp;

        // Extract image metadata and save it to the file model
        await extractImageInfo(file, file_model, {});

        // Store the metadata in database record
        await updateFileMetadata(file, file_model);

        // Copy image original and downscaled versions to MLP library
        await copyImageTo(src, versions.raw);
        await copyImageTo(src, versions.medium);
        await copyImageTo(src, versions.thumb);
        await copyImageTo(src, versions.large);

        // delete temporary files
        await deleteFiles([src]);

        return {
            src,
            metadata: metadata,
        };
    } catch (err) {
        throw err;
    }
};


