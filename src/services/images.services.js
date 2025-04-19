/*!
 * MLP.API.Services.Images
 * File: images.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * Description
 *
 * Image processing module.
 *
 * Revisions
 * - 29-07-2023   Refactored out Redis connection as separate queue service.
 * - 26-09-2024   Simplified image save function.
 */

'use strict';

import { mkdir } from 'fs/promises';
import path from 'path';
import * as stream from "stream";
import fs from 'fs';
import sharp from 'sharp';
import * as util from "util";
import { insert } from './files.services.js';
import { sanitize } from '../lib/data.utils.js';
import { ExifTool } from 'exiftool-vendored';

/**
 * Available image version sizes 
 * - used to set default image size by width
 * - thumb: thumbnail sized image
 * - medium: medium sized image
 * - large: large sized image
 * */

const imageSizes = {
    thumb: 150,
    medium: 900,
    large: 1500,
};


/**
 * Save processed raw image file and resampled versions.
 *
 * @public
 * @return {Promise} result
 * @param filename
 * @param metadata
 * @param owner
 * @param imageState
 * @param options
 * @param queue
 */

export const uploadImage = async (file, file_model, owner) => {

    try {

        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        // retrieve image state/type and secure token
        const imageType = file_model.getValue('image_state') || file_model.getValue('image_type') || 'unknown';
        const secureToken = file_model.getValue('secure_token');

        // create raw path directory with image state (if does not exist)
        const dirPath = path.join(process.env.MLE_UPLOAD_DIR, owner.getValue('fs_path'));
        const rawDirPath = path.join(dirPath, imageType);
        const rawFilePath = path.join(rawDirPath, file.getValue('filename'));
        await mkdir(rawDirPath, { recursive: true });

        // check that file path is valid 
        if (rawFilePath === file.getValue('fs_path')) {
            throw new Error('Invalid defined image file path.');
        }

        if (!fs.existsSync(rawFilePath)) {

        }
        const versions = {
            // create new filesystem path
            // - format: <UPLOAD_PATH>/<IMAGE_TYPE/IMAGE_STATE>/<FILENAME>
            raw: {
                format: 'raw',
                path: rawFilePath,
                size: null,
            },
            // resized versions
            thumb: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_PATH, `thumb_${secureToken}.jpeg`),
                size: imageSizes.thumb,
            },
            medium: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_PATH, `medium_${secureToken}.jpeg`),
                size: imageSizes.medium,
            },
            large: {
                format: 'jpeg',
                path: path.join(process.env.MLE_LOWRES_PATH, `full_${secureToken}.jpeg`),
                size: imageSizes.large,
            },
        };


        let isRAW = false;
        let copySrc = src;


        //
        // // convert RAW image to tiff
        // // Reference: https://github.com/zfedoran/dcraw.js/
        // let bufferRaw = dcraw(buffer, {
        //     useEmbeddedColorMatrix: true,
        //     exportAsTiff: true,
        //     useExportMode: true,
        // });
        //
        // // create temporary file for upload (if format is supported)
        // if (bufferRaw) {
        //     const tmpName = Math.random().toString(16).substring(2) + '-' + filename;
        //     copySrc = path.join(process.env.MLE_TMP_DIR, path.basename(tmpName));
        //     await writeFile(copySrc, bufferRaw);
        //     isRAW = true;
        // }
        // delete buffer
        // buffer = null;
        // bufferRaw = null;
        // get image metadata
        await getImageInfo(copySrc, metadata, options, isRAW);

        // add file record to database
        await insert(file, file_model, client);

        // copy image versions to data storage
        await copyImageTo(src, versions.raw);
        await copyImageTo(copySrc, versions.medium);
        await copyImageTo(copySrc, versions.thumb);
        await copyImageTo(copySrc, versions.large);

        // delete temporary files
        src === copySrc
            ? await deleteFiles([src])
            : await deleteFiles([src, copySrc]);

        return {
            raw: isRAW,
            src: copySrc,
            metadata: metadata,
        };
    } catch (err) {
        throw err;
    } finally {
        client.release(true);
    }


};


/**
 * Create file source URLs for resampled images from file data.
 *
 * @public
 * @param {String} type
 * @param {Object} data
 * @return {Promise} result
 */

export const getImageURL = (type = '', data = {}) => {

    const { secure_token = '' } = data || {};
    const rootURI = `${process.env.MLE_API_HOST}/uploads/`;

    // generate resampled image URLs
    const imgSrc = (token) => {
        return Object.keys(imageSizes).reduce((o, key) => {
            o[key] = new URL(`${key}_${token}.jpeg`, rootURI);
            return o;
        }, {});
    };

    // handle image source URLs
    // - images use scaled versions of raw files
    const fileHandlers = {
        historic_images: () => {
            return imgSrc(secure_token);
        },
        modern_images: () => {
            return imgSrc(secure_token);
        },
        supplemental_images: () => {
            return imgSrc(secure_token);
        },
    };

    // Handle file types
    return fileHandlers.hasOwnProperty(type) ? fileHandlers[type]() : null;
};

/**
 * Extracts the following EXIF (Extended Image File) metadata from the image file:
 * 
 * - MIME type
 * - File type
 * - Image Height
 * - Image Width
 * - Color Space
 * - Bit Depth
 * - Capture Date
 * - Exposure Time
 * - ISO
 * - Focal Length
 * - Geographical Information
 * 
 *
 * @public
 * @param {Model} file - file model
 * @param {Model} file_model - file model metadata
 * @return {Promise} output file data
 */
export const getImageInfo = async (
    file,
    file_model
) => {

    // source of temporary file
    const src = path.join(process.env.MLE_UPLOAD_DIR, file.getValue('filename_tmp'));
    const fileType = file.getValue('file_type');

    // extract exif metadata using ExifTool (vendored)
    const exiftool = new ExifTool({ taskTimeoutMillis: 5000 });
    const exifTags = await exiftool.read(src);

    // copy EXIF metadata
    // - file size is set during file upload
    if (ProfileDateTime
        && (fileType === 'modern_images' || fileType === 'historic_images')) {
        // copy EXIF capture date to file metadata
        file_model.setValue('capture_datetime', ProfileDateTime.toDate());
    }

    file_model.setValue('mimetype', exifTags?.MIMEType);
    file_model.setValue('format', exifTags?.FileType || 'raw');
    file_model.setValue('x_dim', exifTags?.ImageWidth);
    file_model.setValue('y_dim', exifTags?.ImageHeight);
    file_model.setValue('channels', exifTags?.ColorSpaceData === 'RGB' ? 3 : 1);
    file_model.setValue('density', sanitize(exifTags?.BitDepth, 'integer'));
    file_model.setValue('shutter_speed', sanitize(exifTags?.ExposureTime, 'float'));
    file_model.setValue('f_stop', sanitize(exifTags?.Fnumber, 'float'));
    file_model.setValue('iso', sanitize(exifTags?.ISO, 'integer'));
    file_model.setValue('focal_length', sanitize(exifTags?.FocalLength, 'integer'));
    file_model.setValue('lat', sanitize(exifTags?.GPSLatitude, 'float'));
    file_model.setValue('lng', sanitize(exifTags?.GPSLongitude, 'float'));
    file_model.setValue('elev', sanitize(exifTags?.GPSAltitude, 'float'));

    // include camera model (if available)
    const camera = options.cameras
        .find(camera => camera.label === Model);
    if (camera) file_model.setValue('cameras_id', camera.value);

    await exiftool.end();

}


/**
 * Copy image files to library. Applies file conversion if requested, otherwise
 * skips conversion on raw files. Images are resized (if requested).
 *
 * @return {Object} output file data
 * @src public
 * @param src
 * @param output
 */

export const copyImageTo = async (src, output) => {

    // Disable Sharp cache
    sharp.cache(false);
    sharp.concurrency(1);

    // Create pipeline for saving and resizing the image, converting to JPEG
    // and use pipe to read from bucket read stream

    // const image = new Jimp(src, function (err, image) {
    //     const w = image.bitmap.width; //  width of the image
    //     const h = image.bitmap.height; // height of the image
    //     console.log(Jimp)
    // });

    const pipeline = util.promisify(stream.pipeline);

    async function run() {
        await pipeline(
            fs.createReadStream(src),
            output.format !== 'raw'
                ? sharp().resize({ width: output.size }).jpeg({ quality: 80 })
                : new stream.PassThrough(),
            fs.createWriteStream(output.path)
        );
    }

    await run().catch(console.error);
    console.log(`Raw image ${src} saved to ${output.path}.`)

};


