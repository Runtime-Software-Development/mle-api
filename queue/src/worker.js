/**
 * @file worker.js
 * @description Defines the asynchronous worker function to process various file types using Bull and specific upload services.
 * @version 3.0.0
 * @license MIT
 * @copyright (c) 2025 Runtime Software Development Inc.
 */

'use strict'; 

import path from 'path';
import { uploadImage } from './services.js';
import { copyFile } from './utils.js';  
import fs from 'fs';

/**
 * Asynchronously processes a job based on the file type to upload the file.
 * @param {Object} job - The Bull job object containing file details in its data.
 * @returns {Promise<void>} - A promise that resolves when the job is complete 
 * JOB DATA SCHEMA:
 * {
    "type": "object",
    "properties": {
        "file": {
            "type": "object",
            "properties": {
                "file_type": { "type": "string" },
                "owner_id": { "type": "integer" },
                "owner_type": { "type": "string" },
                "id": { "type": "integer" },
                "fs_path": { "type": "string" },
                "filename_tmp": { "type": "string" },
                "mimetype": { "type": "string" },
                "filename": { "type": "string" },
                "created_at": { "type": "string", "format": "date-time" },
                "legacy_path": { "type": "string" },
                "updated_at": { "type": "string", "format": "date-time" },
                "published": { "type": "boolean" },
                "file_size": { "type": "string" }
            },
            "required": ["file_type", "owner_id", "id", "fs_path", "filename_tmp", "mimetype", "filename", "created_at", "updated_at", "published", "file_size"]
        },
        "file_model": {
            "type": "object",
            "properties": {
                "cameras_id": { "type": ["integer", "null"] },
                "files_id": { "type": "integer" },
                "image_state": { "type": "string" },
                "lens_id": { "type": ["integer", "null"] },
                "owner_id": { "type": "integer" },
                "channels": { "type": ["integer", "null"] },
                "density": { "type": ["integer", "null"] },
                "x_dim": { "type": ["integer", "null"] },
                "y_dim": { "type": ["integer", "null"] },
                "bit_depth": { "type": ["integer", "null"] },
                "lat": { "type": ["number", "null"] },
                "lng": { "type": ["number", "null"] },
                "elev": { "type": ["number", "null"] },
                "azim": { "type": ["number", "null"] },
                "f_stop": { "type": ["number", "null"] },
                "format": { "type": ["string", "null"] },
                "secure_token": { "type": "string" },
                "comments": { "type": ["string", "null"] },
                "space": { "type": ["string", "null"] },
                "remote": { "type": ["string", "null"] },
                "shutter_speed": { "type": ["number", "null"] },
                "iso": { "type": ["integer", "null"] },
                "focal_length": { "type": ["number", "null"] },
                "capture_datetime": { "type": ["string", "null"], "format": "date-time" }
            },
            "required": ["files_id", "image_state", "owner_id", "secure_token"]
        },
        "owner": {
            "type": "object",
            "properties": {
                "cameras_id": { "type": ["integer", "null"] },
                "lens_id": { "type": ["integer", "null"] },
                "nodes_id": { "type": "integer" },
                "owner_id": { "type": "integer" },
                "capture_datetime": { "type": ["string", "null"], "format": "date-time" },
                "digitization_datetime": { "type": ["string", "null"], "format": "date-time" },
                "condition": { "type": ["string", "null"] },
                "digitization_location": { "type": ["string", "null"] },
                "comments": { "type": ["string", "null"] },
                "plate_id": { "type": ["integer", "null"] },
                "fn_photo_reference": { "type": ["string", "null"] },
                "lac_ecopy": { "type": ["string", "null"] },
                "lac_wo": { "type": ["string", "null"] },
                "lac_collection": { "type": ["string", "null"] },
                "lac_box": { "type": ["string", "null"] },
                "lac_catalogue": { "type": ["string", "null"] },
                "f_stop": { "type": ["number", "null"] },
                "shutter_speed": { "type": ["number", "null"] },
                "focal_length": { "type": ["number", "null"] }
            },
            "required": ["nodes_id", "owner_id"]
        },
        "process_type": {
            "type": "string",
            "enum": ["image_upload"]
        }
    },
    "required": ["file", "file_model", "owner", "process_type"]
}
 * 
 * 
 */
export const processJob = async (job) => {
    try {
        // Extract job data
        const { file, file_model, owner, process_type } = job.data;

        // Basic validation for critical metadata
        if (!file || !file_model || !owner || !process_type) {
            // Throw an error directly. Bull will catch this and mark the job as failed.
            throw new Error(`[ERROR] Job ${job?.id} missing critical metadata to complete.`);
        }

        // Set process type by file type
        const processType = process_type;
        let result;

        // DEBUG: Uncomment to block job processing (will now mark as failed)
        // throw new Error(`Blocked Job: ${job?.id} / ${processType}`);

        console.log(`[WORKER] Processing JOB ${job.id} / TYPE ${processType}`);

        if (!fs.existsSync(process.env.MLE_TMP_DIR)) {
            throw new Error('Temporary file storage directory does not exist');
        }

        // Ensure the upload and low resolution images directory exists
        if (!fs.existsSync(process.env.MLE_UPLOAD_DIR)) {
            throw new Error('Upload directory does not exist');
        }

        if (!fs.existsSync(process.env.MLE_LOWRES_DIR)) {
            throw new Error('Low resolutuion images directory does not exist');
        }

        // Ensure file upload path exists (or create it if it doesn't)
        const fullPath = path.join(process.env.MLE_UPLOAD_DIR, path.dirname(file?.fs_path));
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`Created upload directory ${fullPath}: ${fs.existsSync(process.env.MLE_UPLOAD_DIR, path.dirname(file?.fs_path))}`);
        }

        switch (processType) {
            case 'supplemental_images':
            case 'historic_images':
            case 'modern_images':
                // Assuming uploadImage is an async function that handles its own errors or throws them
                result = await uploadImage(file, file_model, owner);
                console.log(`[WORKER] Image upload for job ${job.id} completed. Result:`, result);
                // The 'file', 'file_model', 'owner' objects might be large, consider logging only relevant parts or hashing for production
                console.log("Job data for uploadImage:", { file: file.filename, file_model: file_model.image_state, owner: owner.owner_id });
                break;
            default:
                const srcPath = path.join(process.env.MLE_TMP_DIR, file?.filename_tmp);
                const dstPath = path.join(process.env.MLE_UPLOAD_DIR, file?.fs_path);
                console.log(`[WORKER] Copying file source ${srcPath} to ${dstPath}`);
                // Assuming copyFile is an async function that handles its own errors or throws them
                result = await copyFile(srcPath, dstPath);
                console.log(`[WORKER] File copy for job ${job.id} completed. Result:`, result);
                break;
        }

        // resolving (finishing) indicates success:
        // return data, which will be accessible via job.returnvalue
        return { success: true, message: 'Job completed successfully', data: result };

    } catch (error) {
        console.error(`[WORKER] Error processing job ${job?.id}:`, error);
        // Re-throw the error. Bull will catch this, mark the job as failed,
        // and handle retries based on queue options.
        throw error;
    }
};