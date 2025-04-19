/*!
 * MLP.API.Services.Import
 * File: import.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Function receives a multi-part form data and parses it into files 
 * and fields. It takes in a req object representing a Node request 
 * and a callback function.
 * 
 * Inside the function, it creates a busboy instance to parse the 
 * form data. It listens for the 'file' event to handle file data 
 * and the 'field' event to handle field data. It also listens for 
 * the 'close' event to handle the end of parsing the form data.
 * 
 * The function then pipes the request to the busboy instance. 
 * Finally, it returns an object containing the parsed files, the 
 * parsed fields, and the owner information.
 * 
 * The onFile and onField functions are used to parse the file and 
 * field data respectively. 
 * ---------
 * Revisions
 * - [24-08-2024] Updated file importer module to use new version of Busboy.
 */

'use strict';

import busboy from 'busboy';
import { allowedImageMIME, allowedMIME } from "../lib/file.utils.js";
import { genUUID } from '../lib/data.utils.js';
import fs from 'fs';
import path from 'path';
import { getConstructors } from './construct.services.js'; 
/**
 * Receive a multi-part form data and parse it into files and fields.
 *
 * @public
 * @param {Object} req - Node request object.
 * @param {Function} [callback] - Callback function.
 */
export const receive = async (req, model, owner, callback) => {

    /**
     * create busboy instance to parse form data
     */
    const bb = busboy({ headers: req.headers });
    const files = [];
    const fields = [];

    // generate model constructors
    const constructors = await getConstructors();
    
    /**
     * Abort the request and send 413 status code
     * @private
     */
    function abort(err) {
        console.error(err)
        // Unpipe the request from the busboy instance
        req.unpipe(bb);
        callback(err, null);

        // If the request has not been aborted, set the connection header to close
        // and send 413 status code
        // if (!req.aborted) {
        //     res.set("Connection", "close");
        //     res.sendStatus(413);
        // }
    }

    /**
     * Parse file data
     */
    bb.on('file', (name, file, info) => { onFile(name, file, info, files, abort, constructors) });

    /**
     * Parse field data
     */
    bb.on('field', (name, field, info) => { onField(name, field, info, fields, abort) });

    /**x
     * Error event
     */
    bb.on('error', abort);

    /**
     * Close event
     */
    bb.on('close', () => {

        /**
         * Matches fields with their corresponding file objects based on the index property.
         */

        const metadata = fields.reduce((acc, field) => {
            if (field.index === null) {
                acc[field.name] = field.value;
            }
            return acc;
        }, {});
        // include owner data to model metadata
        metadata.owner_id = owner?.id;
        metadata.owner_type = owner?.type;

        // Return parsed multi-part data as model instances
        const result = { 
            model: model.setData(metadata),
            files: files.map(({index, file, file_type, encoding}) => {
                // filter metadata fields attached to files by index
                const matchedFields = fields.filter((field) => field.index === index);
                const fileModelData = matchedFields.reduce((acc, field) => {
                  acc[field.name] = field.value;
                  return acc;
                }, {});
                return { 
                    file: new constructors['files'](file), 
                    file_model: new constructors[file_type](fileModelData),
                    file_type: file_type, 
                    encoding: encoding
                };
            }),
            owner: owner
        }
        /**
         * Return parsed multi-part data
         */
        callback(null, result);
    });

    // Listen for the 'aborted' event
    req.on("aborted", abort);

    /**
     * Pipe request to busboy
     */
    req.pipe(bb);


}

/**
 * Parse file objects.
 * 
 * Description
 * 
 * Extracts the filename, encoding, and MIME type from the info object.
 * Logs information about the file to the console.
 * Creates a temporary file for the uploaded file and pipes the file stream to it.
 * Validates the file by checking for empty data and logs progress to the console.
 * Adds the file to an array of files, including metadata such as file type, MIME type, 
 * filename, and temporary file path.
 *
 * @public
 * @param name - name of the file
 * @param file - file stream
 * @param info - info object containing filename, encoding, and MIME type
 * @param files - array of files
 */
export const onFile = (name, file, info, files, abort) => {

    try {
        const { filename, encoding, mimeType } = info;

        // Process any stringified array input data indexed with '[<index>]' values
        // - parses stringified representation of a formData Object
        const match = name.match(/(.*)\[(\d+)\]$/);
        let fileType = name, index = null;
        if (match) {
            fileType = match[1];
            index = parseInt(match[2], 10);
        }

        // Reject unacceptable MIME types for given file type
        if (
            !allowedMIME(mimeType)
            || (['historic_images', 'modern_images', 'supplemental_images'].includes(name)
                && !allowedImageMIME(mimeType))
        ) {
            abort(new Error('invalidMIMEType'));
        }

        // Upload as temporary file to local storage before processing
        const safeFilename = filename.replace(/[^\w\s.-]+/g, '_');
        const filename_tmp = genUUID();
        file.pipe(fs.createWriteStream(path.join(process.env.MLE_TMP_DIR, filename_tmp)));

        // Create a readable stream for the file
        let fileSize = 0;
        file.on('data', (data) => {
            // Validate the file
            if (data.length === 0) {
                abort(new Error('invalidRequest'));
            }
            fileSize += data.length; // Accumulate file size
        }).on('close', () => {
            console.log(`${Date.now()} Uploaded file [${name}] processed.`);
        });

        // Add the file to the files array
        files.push({ 
            index,
            file: {
                file_type: fileType,
                filename: safeFilename,
                mimetype: mimeType,
                owner_type:'',
                owner_id:'',
                fs_path: null,
                file_size: fileSize,
                filename_tmp: filename_tmp
            },
            file_type: fileType,
            encoding
        });
    } catch (err) {
        abort(err);
    }
}

/**
 * Reduces indexed fields (for multiple objects) in form data.
 *
 * @public
 * @param {Object} fields - Form data fields to be parsed
 * @param {string} name - Field name
 * @param {string} value - Field value
 * @param {Object} info - Field info
 * @param {Function} abort - Callback for aborted requests
 * @returns {Object} Parsed form fields
 */
export function onField(name, value, info, fields, abort) {
    try {
        // Process any stringified array input data indexed with '[<index>]' values
        // - stringified representation of a formData Object
        const match = name.match(/(.*)\[(\d+)\]$/);
        if (match) {
            // Extract the field name and index
            const [, fieldName, indexStr] = match;
            const index = parseInt(indexStr, 10);
            fields.push({ index, name: fieldName, value, info });
        } else {
            // Add the field to the parsed fields array
            fields.push({ index: null, name, value, info });
        }
    } catch (err) {
        // Abort the request if there is an error
        abort(err);
    }
}
