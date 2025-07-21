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
import { model } from './index.services.js';

/**
 * Promisified version of the busboy file upload handler.
 * @param {Object} req - Node request object.
 * @param {Object} modelType - Model type to set data on.
 * @param {Object} ownerData - Owner information for the files.
 * @returns {Promise<Object>} - Promise resolving to the parsed data.
 */
function promisifyBusboy(req, modelType, ownerData, constructors) {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers });
        const files = [];
        const fields = [];

        // Bind the abort function to the promise reject
        function abort(err) {
            req.unpipe(bb);
            reject(err); // Reject the promise on abort/error
        }

        // Use the passed abortCallback (which now rejects the promise)
        bb.on('file', (name, file, info) => { onFile(name, file, info, files, abort) });
        bb.on('field', (name, field, info) => { onField(name, field, info, fields, abort) });
        bb.on('error', abort); // Busboy error
        req.on("aborted", abort); // Client disconnect

        bb.on('close', async () => {
            try {
                // set file model metadata
                const metadata = fields.reduce((acc, field) => {
                    if (field.index === null) {
                        acc[field.name] = field.value;
                    }
                    return acc;
                }, {});

                // index fields by their index value
                const indexedMetadata = fields.reduce((acc, field) => {
                    if (typeof field.index === 'number' && field.index >= 0) {
                        if (!acc.hasOwnProperty(field.name) || !Array.isArray(acc[field.name])) {
                            acc[field.name] = [];
                        }
                        acc[field.name][field.index] = field.value;
                    }
                    return acc;
                }, {});

                // set additional file metadata
                const imageState = metadata?.image_state || '';
                const imageType = metadata?.image_type || '';
                const metadataFileType = metadata?.type || '';

                // handle owner data
                if (ownerData) {
                    metadata.owner_type = ownerData?.type;
                    metadata.owner_id = ownerData?.id;
                }

                console.log(`Processing import for model ${modelType}`, ownerData);

                // return parsed data
                const result = {
                    indexedMetadata,
                    metadata,
                    owner: ownerData?.type && new constructors[ownerData?.type](ownerData),
                    model: new constructors[modelType](metadata),
                    files: files.map(({ index, file, file_type, secure_token, encoding }) => {
                        const fileModelData = fields
                            .filter((field) => field.index === index)
                            .reduce((acc, field) => {
                                acc[field.name] = field.value;
                                return acc;
                            }, {});
                        fileModelData.secure_token = secure_token;

                        // when file type is the same as proximate model type, set owner type and id
                        if (file_type === modelType) {
                            // set owner type and id for model files
                            fileModelData.owner_type = ownerData?.type;
                            fileModelData.owner_id = ownerData?.id;
                            file.owner_type = ownerData?.type;
                            file.owner_id = ownerData?.id;
                        }

                        console.log(`Processing file: ${file?.filename} of type ${file_type} for file model ${modelType}`);

                        // insert token into filename
                        const tokenizedFilename = [
                            file?.filename.slice(0, file?.filename.lastIndexOf('.')),
                            secure_token,
                            file?.filename.slice(file?.filename.lastIndexOf('.'))].join('');

                        // update file system path
                        // - capture images include image state, image type, file type and the file system path
                        //   is based on the file model.
                        // - other file types file system paths are based on the owner node.
                        file.fs_path = path.join(
                            fileModelData.fs_path || ownerData?.fs_path,
                            modelType !== file_type ? modelType : '',
                            file_type,
                            imageType,
                            metadataFileType,
                            imageState,
                            tokenizedFilename
                        );

                        return {
                            file: new constructors['files'](file),
                            file_model: new constructors[file_type]({ ...fileModelData, ...metadata }),
                            file_type,
                            encoding
                        };
                    }),
                };
                resolve(result); // Resolve the promise on close

            } catch (err) {
                reject(err); // Reject the promise on error
            }
        });
        req.pipe(bb);
    });
}

/**
 * Receive a multi-part form data and parse it into files and fields.
 *
 * @public
 * @param {Object} req - Node request object.
 * @param {Function} [callback] - Callback function.
 */
// Modify your `receive` function
export const receive = async (req, modelType, owner) => {
    const constructors = await getConstructors();
    return promisifyBusboy(req, modelType, owner, constructors);
};

/**
 * Parse file objects.
 * 
 * Description
 * 
 * Extracts the filename, encoding, and MIME type from the info object.
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
            abort(new Error('invalidMIMEType')); // This now rejects the promise
        }

        // Upload as temporary file to local storage before processing
        const secure_token = genUUID();
        const safeFilename = filename.replace(/[^\w\s.-]+/g, '_');
        // insert token into tmp filename
        const filename_tmp = [
            safeFilename.slice(0, safeFilename.lastIndexOf('.')),
            '_',
            secure_token,
            safeFilename.slice(safeFilename.lastIndexOf('.'))
        ].join('');

        // Pipe the file stream to a temporary file
        file.pipe(fs.createWriteStream(path.join(process.env.MLE_TMP_DIR, filename_tmp)));

        // Create a readable stream for the file
        let fileSize = 0;
        file.on('data', (data) => {
            if (data.length === 0) {
                abort(new Error('invalidRequest'));
            }
            fileSize += data.length;
        });

        // Add the file to the files array
        files.push({
            index,
            file: {
                file_type: fileType,
                filename: safeFilename,
                mimetype: mimeType,
                owner_type: '',
                owner_id: '',
                fs_path: null,
                file_size: fileSize,
                filename_tmp: filename_tmp
            },
            secure_token,
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
        abort(err);
    }
}
