#!/usr/bin/env node

/*!
 * MLE.Queue.Worker.Services
 * File: worker.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * Description
 *
 * File processing service.
 *
 * Revisions
 */

'use strict';

import { uploadFile } from '../src/services/files.services.js';
import { uploadImage } from '../src/services/images.services.js';

/**
 * Process image files.
 *
 * @public
 * @return {Promise} result
 * @param data
 * @param callback
 */

export const processJob = async (job, callback) => {

    try {
        let result;
        // Select file handler
        const fileType = job?.data?.file?.getValue(file_type);
        const {file, file_model, owner} = job?.data || {};
        const srcPath = path.join(process.env.MLE_TMP_DIR, file.getValue('filename_tmp'));
        const dstPath = path.join(process.env.MLE_UPLOAD_DIR, file.getValue('fs_path'));

        switch (fileType) {
            case 'historic_images':
                result = await uploadImage(file, file_model, owner);
                break;
            case 'modern_images':
                result = await uploadImage(file, file_model, owner);
                break;
            case 'supplemental_images':
                result = await uploadImage(file, file_model, owner);
                break;
            case 'metadata_files':
                result = await uploadFile(srcPath, dstPath);
                break;
            case 'field_notes':
                result = await uploadFile(srcPath, dstPath);
                break;
            default:
                callback(new Error(`Unsupported file model type: ${fileType}`), null);
                break;
        }

        // Once the job is completed, call the callback function to signal success and pass any relevant data
        callback(null, { success: true, message: 'Job completed successfully' });

    } catch (error) {
        // If an error occurs during job processing, call the callback function to signal failure and pass the error
        callback(error, null);
    }
};
   

export default { processJob }