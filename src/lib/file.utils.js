/*!
 * MLP.API.Utilities.Files
 * File: files.utils.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Generic file utilities.
 *
 * ---------
 * Revisions
 * - [25-08-2024] Updated mimetype lookup to include both extensions and mime types.
 */

'use strict';

/**
 * Extracts label for given file.
 * - extracts prefix from filename to use as a label.
 *
 * @public
 * @return {String} label
 * @param filename
 * @param defaultLabel
 */

export const extractFileLabel = (filename, defaultLabel='Unknown') => {

    if (!filename) return defaultLabel;

    // extract prefix substring from filename to omit key token string
    // - looks for last underscore '_' in filename as index
    // - OR looks for last dot '.' in filename as index
    const lastIndex = filename.lastIndexOf('_') > 0
        ? filename.lastIndexOf('_')
        : filename.lastIndexOf('.');
    const abbrevFilename = filename.substring(0, lastIndex);

    // Handle empty file labels
    return abbrevFilename ? abbrevFilename : defaultLabel;
}

/**
 * CSV parser for JSON data.
 *
 * @param {Object} json
 * @return {String} CSV data
 * @src public
 */

export function json2csv(json) {
    let fields = Object.keys(json[0])
    let replacer = function(key, value) { return value === null ? '' : value }
    let csv = json.map(function(row){
        return fields.map(function(fieldName){
            return JSON.stringify(row[fieldName], replacer)
        }).join(',')
    })
    csv.unshift(fields.join(',')) // add header column
    return csv.join('\r\n');
}

/**
 * Lookup allowed mimetype from file extension.
 *
 * @src public
 * @param filename
 * @return {String} mimetype
 */

// allowed MIME types for images
export const imageMIMETypes = {
    'bm': 'image/bmp',
    'bmp': 'image/bmp',
    'gif': 'image/gif',
    'jpe': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'tif': 'image/tiff',
    'tiff': 'image/tiff',
    'x-png': 'image/png',
    '3FR': 'image/x-hasselblad-3fr',
    'ARW': 'image/x-sony-arw',
    'CR2': 'image/x-canon-cr2',
    'CRW': 'image/x-canon-crw',
    'DCR': 'image/x-kodak-dcr',
    'DNG': 'image/x-adobe-dng',
    'ERF': 'image/x-epson-erf',
    'K25': 'image/x-kodak-k25',
    'KDC': 'image/x-kodak-kdc',
    'MRW': 'image/x-minolta-mrw',
    'NEF': 'image/x-nikon-nef',
    'ORF': 'image/x-olympus-orf',
    'PEF': 'image/x-pentax-pef',
    'RAF': 'image/raf',
    'RAF2': 'image/x-fuji-raf',
    'RAW': 'image/x-panasonic-raw',
    'SR2': 'image/x-sony-sr2',
    'SRF': 'image/x-sony-srf',
    'WEBP': 'image/webp',
    'X3F': 'image/x-sigma-x3f',
    'stream': 'application/octet-stream'
};

// extended MIME types for supplemental files
export const supplementalMIMETypes = {
    'pdf': 'application/pdf',
    'rtf': 'application/rtf'
};

// retrieve MIME type from filename extension
export function getMIME(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return imageMIMETypes.hasOwnProperty(ext)
        ? imageMIMETypes[ext]
        : supplementalMIMETypes.hasOwnProperty(ext)
            ? supplementalMIMETypes[ext]
            : null;
}

// determine if any MIME type is allowed
export function allowedMIME(mimeType) {
    return Object.keys(imageMIMETypes).includes(mimeType)
        || Object.keys(supplementalMIMETypes).includes(mimeType)
        || Object.values(imageMIMETypes).includes(mimeType)
        || Object.values(supplementalMIMETypes).includes(mimeType);
}

// determine if image MIME type is allowed
export function allowedImageMIME(mimeType) {
    return Object.keys(imageMIMETypes).includes(mimeType) || Object.values(imageMIMETypes).includes(mimeType);
}


/**
 * Determines image format based on file signature.
 * - NOTE: Not all of the following formats have been implemented.
 * Bitmap format .bmp 42 4d BM
 * FITS format .fits 53 49 4d 50 4c 45 SIMPL
 * GIF format .gif 47 49 46 38 GIF
 * Graphics Kernel System .gks 47 4b 53 4d GKS
 * IRIS rgb format .rgb 01 da
 * ITC (CMU WM) format .itc f1 00 40 bb
 * JPEG File Interchange Format .jpg ff d8 ff e0
 * NIFF (Navy TIFF) .nif 49 49 4e 31 IIN
 * PM format .pm 56 49 45 57 VIE
 * PNG format .png 89 50 4e 47 .PN
 * Postscript format .[e]ps 25 21 %
 * Sun Rasterfile .ras 59 a6 6a 95 Y.j
 * Targa format .tga xx xx xx ..
 * TIFF format (Motorola - big endian) .tif 4d 4d 00 2a MM.
 * TIFF format (Intel - little endian) .tif 49 49 2a 00 II*
 * X11 Bitmap format .xbm xx x
 * XCF Gimp file structure .xcf 67 69 6d 70 20 78 63 66 20 76 gimp xc
 * Xfig format .fig 23 46 49 47 #FI
 * XPM format .xpm 2f 2a 20 58 50 4d 20 2a 2f
 * @return {string} image format
 */

export const getImageType = (buffer) => {
    const int8Array = new Uint8Array(buffer);
    const [b0, b1, b2, b3] = int8Array.slice(0, 4);

    // console.log('File Signature:', b0, b1, b2, b3);
    const formats = {
        'png': [],
        'gif': [],
        'bmp': [],
        'jpg': [255, 216, 255, 219],
        'tiff-le': [77, 77, 0, 42],
        'tiff-be': [73, 73, 42, 0],
    };
    const detected = Object.keys(formats).find((type) => {
        return b0 === parseInt(formats[type][0])
            && b1 === parseInt(formats[type][1])
            && b2 === parseInt(formats[type][2])
            && b3 === parseInt(formats[type][3]);
    });
    return detected || 'unknown';
};

