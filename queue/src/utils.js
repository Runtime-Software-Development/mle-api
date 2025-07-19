/**
 * @file utils.js
 * @description File processing utilities, including data sanitization and image metadata extraction.
 * @version 3.0.0
 * @license MIT
 */

'use strict';

import { imageSizes } from './services.js';
import { ExifTool } from 'exiftool-vendored';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import stream from 'stream';
import util from 'util';
import { getCameraMetadata } from './services.js';

/**
 * Ensures a directory exists, creating it if it doesn't.
 * @param {string} directoryPath - The absolute path to the directory.
 */
export const ensureDirectoryExists = (directoryPath) => {
    if (!directoryPath) {
        console.warn('Attempted to ensure existence of an empty directory path.');
        return;
    }
    try {
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
            console.log(`Created directory: ${directoryPath}`);
        } else {
            console.log(`Directory already exists: ${directoryPath}`);
        }
    } catch (err) {
        console.error(`Error ensuring directory exists for ${directoryPath}:`, err);
        // Depending on criticality, you might want to throw the error
        // process.exit(1); // Exit if a critical directory cannot be created
    }
};

/**
 * Ensures all specified application directories exist.
 */
export const ensureAppDirectories = () => {
    console.log('Ensuring application directories exist...');

    // Use process.env for paths, as they come from your .env file or environment
    ensureDirectoryExists(process.env.MLE_UPLOAD_DIR);
    ensureDirectoryExists(process.env.MLE_LOWRES_DIR);

    console.log('Application directory check complete.');
};

/**
 * Sanitize data by PostGreSQL data type. Note for composite
 * user-defined types (i.e. coord, camera_settings, dims) the
 * data array is converted to a string representation of its tuple.
 * Empty strings are converted to NULL to trigger postgres non-empty
 * constraints.
 *
 * @param data
 * @param {String} datatype
 * @return {Object} cleanData
 * @src public
 */

export function sanitize(data, datatype) {
    const sanitizers = {
        'boolean': function () {
            return !!data;
        },
        'varying character': function () {
            // Replaces HTML tags with null string.
            return ((data === null) || (data === ''))
                ? ''
                : data.toString().replace(/(<([^>]+)>)/ig, '');
        },
        'integer': function () {
            return isNaN(parseInt(data)) ? null : parseInt(data);
        },
        'double precision': function () {
            return isNaN(parseFloat(data)) ? null : parseFloat(data);
        },
        'float': function () {
            return isNaN(parseFloat(data)) ? null : parseFloat(data);
        },
        'json': function () {
            return JSON.stringify(data);
        },
        'USER-DEFINED': function () {
            return !Array.isArray(data) ? null : `(${data.join(',')})`;
        },
        'text': function () {
            // Replaces HTML tags with null string.
            return ((data === null) || (data === ''))
                ? ''
                : data.toString().replace(/(<([^>]+)>)/ig, '');
        },
        'default': function () {
            return data === '' ? null : data;
        },
    };
    return (sanitizers[datatype] || sanitizers['default'])();
}

/**
 * Create file source URLs for resampled images from file data.
 *
 * @param {string} type - The type of image.
 * @param {Object} data - The file data object.
 * @returns {Object|null} - An object containing image URLs by size, or null if type is not handled.
 */

export const getImageURL = (type = '', data = {}) => {
    const secure_token = data.getValue('secure_token') || '';
    const rootURI = `${process.env.API_HOST}/uploads/`;

    const imgSrc = (token) => {
        return Object.keys(imageSizes).reduce((o, key) => {
            o[key] = new URL(`${key}_${token}.jpeg`, rootURI);
            return o;
        }, {});
    };

    const fileHandlers = {
        historic_images: () => imgSrc(secure_token),
        modern_images: () => imgSrc(secure_token),
        supplemental_images: () => imgSrc(secure_token),
    };

    return fileHandlers.hasOwnProperty(type) ? fileHandlers[type]() : null;
};

/**
 * Extracts EXIF metadata from the image file.
 *
 * @param {Object} file - File data model.
 * @param {Object} file_model - File metadata model.
 * @param {Object} options - Additional options (e.g., cameras).
 * @param {boolean} isRAW - Flag indicating if the file is a RAW image.
 * @returns {Promise<void>} - Promise resolving when metadata extraction is complete.
 */

export const extractImageInfo = async (file, file_model) => {
    // Define the tmp file source path and file type
    const TMP_DIR = process.env.MLE_TMP_DIR;
    const src = path.join(TMP_DIR || '', file?.filename_tmp);
    const fileType = file?.file_type;
    const cameras = await getCameraMetadata();

    /**
     * Converts an ExifDateTime string to a JavaScript Date object.
     * @param {string} exifDateTime - The ExifDateTime string (e.g., "2025:05:19 13:36:20").
     * @returns {Date|null} - A JavaScript Date object or null if the input is invalid.
     */
    const convertExifDateTime = (exifDateTime) => {
        if (!exifDateTime) return null;

        console.log(`[INFO] Converting ExifDateTime: ${exifDateTime}`);

        try {
            const date = new Date(exifDateTime);
            if (fileType === 'modern_images' || fileType === 'historic_images') {
                file_model.capture_datetime = date.toISOString();
            }
            console.log(`[INFO] Converted ExifDateTime to: ${file_model.capture_datetime}`);

        } catch (error) {
            console.error('[ERROR] Failed to convert ExifDateTime:', error);
            return null;
        }
    };

    const exiftool = new ExifTool({ taskTimeoutMillis: 5000 });
    try {
        // Start the ExifTool process
        const exifTags = await exiftool.read(src);

        // Debug
        console.log(`[INFO] EXIF metadata for file ${file?.filename}:`, exifTags);

        convertExifDateTime(exifTags?.CreateDate);
        file_model.mimetype = exifTags?.MIMEType;
        file_model.format = exifTags?.FileType || 'raw';
        file_model.x_dim = exifTags?.ImageWidth;
        file_model.y_dim = exifTags?.ImageHeight;
        file_model.channels = exifTags?.ColorSpaceData === 'RGB' ? 3 : 1;
        file_model.density = sanitize(exifTags?.BitDepth, 'integer');
        file_model.shutter_speed = sanitize(exifTags?.ExposureTime, 'float');
        file_model.f_stop = sanitize(exifTags?.Fnumber, 'float');
        file_model.iso = sanitize(exifTags?.ISO, 'integer');
        file_model.focal_length = sanitize(exifTags?.FocalLength, 'float');
        file_model.lat = sanitize(exifTags?.GPSLatitude, 'float');
        file_model.lng = sanitize(exifTags?.GPSLongitude, 'float');
        file_model.elev = sanitize(exifTags?.GPSAltitude, 'float');

        // Find matched camera
        let matchedCamera = null;
        if (exifTags?.Model && Array.isArray(cameras)) {
            const normalizedModel = typeof exifTags?.Model === 'string' && exifTags?.Model.toLowerCase().replace(/[^a-z0-9]/g, '');

            matchedCamera = (cameras || []).find(camera => {
                // Ensure camera.label is a string before normalizing
                if (typeof camera.label !== 'string') {
                    return false;
                }
                const normalizedLabel = typeof camera?.label === 'string' && camera?.label.toLowerCase().replace(/[^a-z0-9]/g, '');

                return  normalizedModel.includes(normalizedLabel) || normalizedLabel.includes(normalizedModel);
            });
        }
        // set cameras_id to the matched camera
        file_model.cameras_id = matchedCamera?.value || null;

    } catch (error) {
        console.warn('[WARN] EXIF metadata extraction failed:', error);
    }
    finally {
        await exiftool.end();
    }
};


/**
 * Build file source path for resampled images and metadata files
 * from file data.
 *
 * @public
 * @param file
 * @param version
 * @return {String} result
 */

export const getFilePath = (file, version = 'medium') => {

    const { fs_path = '', secure_token = '', file_type = '' } = file || {};
    const lowResPath = process.env.MLE_LOWRES_PATH;
    const defaultPath = process.env.MLE_UPLOAD_DIR;

    // handle image source URLs differently than metadata files
    // - images use scaled versions of raw files
    // - metadata uses PDF downloads
    const fileHandlers = {
        historic_images: () => {
            return version === 'raw'
                ? path.join(path.join(defaultPath, fs_path))
                : path.join(lowResPath, `${version}_${secure_token}.jpeg`);
        },
        modern_images: () => {
            return version === 'raw'
                ? path.join(path.join(defaultPath, fs_path))
                : path.join(lowResPath, `${version}_${secure_token}.jpeg`);
        },
        supplemental_images: () => {
            return version === 'raw'
                ? path.join(path.join(defaultPath, fs_path))
                : path.join(lowResPath, `${version}_${secure_token}.jpeg`);
        },
        default: () => {
            return path.join(path.join(defaultPath, fs_path));
        },
    };

    // Handle file types
    return fileHandlers.hasOwnProperty(file_type)
        ? fileHandlers[file_type]()
        : fileHandlers.default();
};
/**
 * Recursively list files in a directory.
 *
 * @public
 * @param localPath
 * @param done
 * @return {Array} files
 */

export const listFiles = (localPath, done = () => { }) => {
    // get root directories
    const lowResPath = process.env.LOWRES_PATH;
    const defaultPath = process.env.UPLOAD_DIR;
    // joining path of local directory to root path
    const dir = path.join(defaultPath, localPath);

    let results = [];
    fs.readdir(dir, function (err, list) {
        if (err) return done(err);
        let i = 0;
        (function next() {
            let file = list[i++];
            if (!file) return done(null, results);
            file = path.resolve(dir, file);
            fs.stat(file, function (err, stat) {
                console.log(stat);
                if (stat && stat.isDirectory()) {
                    listFiles(file, function (err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
};


/**
 * Copy image files to library. Applies file conversion if requested, otherwise skips conversion on raw files.
 *
 * @param {string} src - Path to the source image file.
 * @param {Object} dst - Output options including format, path, and size.
 * @returns {Promise<void>} - Promise resolving when the image is copied and potentially resized.
 */

export const copyImageTo = async (src, dst) => {
    sharp.cache(false);
    sharp.concurrency(0);

    const pipeline = util.promisify(stream.pipeline);

    try {
        await pipeline(
            fs.createReadStream(src),
            dst.format !== 'raw'
                ? sharp().resize({ width: dst.size }).jpeg({ quality: 80 })
                : new stream.PassThrough(),
            fs.createWriteStream(dst.path)
        );
        console.log(`Image ${src} saved to ${dst.path} (format: ${dst.format}, size: ${dst.size}).`);
    } catch (error) {
        console.error(`Error processing ${src} to ${dst.path}:`, error);
        throw error;
    }
};
/**
 * Copy a file from source to destination.
 *
 * @param {string} src - Path to the source file.
 * @param {string} dst - Path to the destination file.
 * @returns {Promise<void>} - Promise resolving when the file is copied.
 * */

export const copyFile = async (src, dst) => {
    try {
        // copy file to data storage
        return await fs.promises.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
    } catch (error) {
        console.error(`Error copying file from ${src} to ${dst}:`, error);
        throw error;
    }
};
/**
 * Delete files from the filesystem.
 *
 * @param {string[]} files - Array of file paths to delete.
 * @returns {Promise<void>} - Promise resolving when files are deleted.
 */

export const deleteFiles = async (files) => {
    for (const file of files) {
        try {
            await fs.promises.unlink(file);
            console.log(`Deleted file: ${file}`);
        } catch (error) {
            console.error(`Error deleting file ${file}:`, error);
        }
    }
};

