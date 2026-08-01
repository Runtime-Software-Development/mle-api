/**
 * @file worker.js
 * @description Defines the asynchronous worker function to process various file types using Bull and specific upload services.
 * @version 3.0.0
 * @license MIT
 * @copyright (c) 2025 Runtime Software Development Inc.
 */

'use strict'; 

import path from 'path';
import { processImageAssets, processImageMetadata } from './services.js';
import { copyFile } from './utils.js';  
import fs from 'fs';
import { isAllowedImageMIMEType, isAllowedMIMEType, isImageProcessType, normalizeMIMEType } from './mime.js';

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
export const processJob = async (job, queue) => {
    const diagnostics = {
        startedAt: new Date().toISOString(),
        finishedAt: null,
        events: [],
        warnings: [],
        errors: [],
        paths: {},
        metadata: {},
    };

    const addEvent = (level, message, details = null) => {
        diagnostics.events.push({
            at: new Date().toISOString(),
            level,
            message,
            details,
        });
    };

    const addWarning = (message) => {
        diagnostics.warnings.push({ at: new Date().toISOString(), message });
    };

    const addError = (message) => {
        diagnostics.errors.push({ at: new Date().toISOString(), message });
    };

    const persistDiagnostics = async (status = 'running') => {
        try {
            await job.update({
                ...job.data,
                diagnostics: {
                    ...diagnostics,
                    status,
                },
            });
        } catch (updateError) {
            console.warn(`[WORKER] Failed to persist diagnostics for job ${job?.id}:`, updateError?.message || updateError);
        }
    };

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
        const normalizedMIMEType = normalizeMIMEType(file?.mimetype);
        let result;

        diagnostics.paths = {
            tmp: path.join(process.env.MLE_TMP_DIR || '', file?.filename_tmp || ''),
            destination: path.join(process.env.MLE_UPLOAD_DIR || '', file?.fs_path || ''),
            lowresRoot: process.env.MLE_LOWRES_DIR || '',
        };

        diagnostics.metadata = {
            fileId: file?.id || null,
            ownerId: owner?.owner_id || null,
            ownerType: owner?.owner_type || null,
            fileType: file?.file_type || null,
            processType,
            mimeType: normalizedMIMEType,
        };

        addEvent('info', 'job_received', diagnostics.metadata);
        await persistDiagnostics('running');

        // DEBUG: Uncomment to block job processing (will now mark as failed)
        // throw new Error(`Blocked Job: ${job?.id} / ${processType}`);

        console.log(`[WORKER] Processing JOB ${job.id} / TYPE ${processType}`);

        if (!isAllowedMIMEType(normalizedMIMEType)) {
            addError(`Unsupported MIME type: ${normalizedMIMEType || 'unknown'}`);
            diagnostics.finishedAt = new Date().toISOString();
            await persistDiagnostics('failed');
            throw new Error(`invalidMIMEType: unsupported MIME type '${normalizedMIMEType || 'unknown'}'`);
        }

        if (isImageProcessType(processType) && !isAllowedImageMIMEType(normalizedMIMEType)) {
            addError(`MIME type not allowed for image processing: ${normalizedMIMEType}`);
            diagnostics.finishedAt = new Date().toISOString();
            await persistDiagnostics('failed');
            throw new Error(`invalidMIMEType: MIME type '${normalizedMIMEType}' is not allowed for image processing`);
        }

        // Keep a normalized value for downstream logging/metadata writes.
        file.mimetype = normalizedMIMEType;

        if (!fs.existsSync(process.env.MLE_TMP_DIR)) {
            addError('Temporary file storage directory does not exist');
            diagnostics.finishedAt = new Date().toISOString();
            await persistDiagnostics('failed');
            throw new Error('Temporary file storage directory does not exist');
        }

        // Ensure the upload and low resolution images directory exists
        if (!fs.existsSync(process.env.MLE_UPLOAD_DIR)) {
            addError('Upload directory does not exist');
            diagnostics.finishedAt = new Date().toISOString();
            await persistDiagnostics('failed');
            throw new Error('Upload directory does not exist');
        }

        if (!fs.existsSync(process.env.MLE_LOWRES_DIR)) {
            addError('Low resolution images directory does not exist');
            diagnostics.finishedAt = new Date().toISOString();
            await persistDiagnostics('failed');
            throw new Error('Low resolutuion images directory does not exist');
        }

        // Ensure file upload path exists (or create it if it doesn't)
        const fullPath = path.join(process.env.MLE_UPLOAD_DIR, path.dirname(file?.fs_path));
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`Created upload directory ${fullPath}: ${fs.existsSync(process.env.MLE_UPLOAD_DIR, path.dirname(file?.fs_path))}`);
            addEvent('info', 'created_upload_directory', { path: fullPath });
        }

        switch (processType) {
            case 'metadata_extract':
                result = await processImageMetadata(file, file_model, {
                    sourcePath: path.join(process.env.MLE_UPLOAD_DIR, file?.fs_path)
                });
                if (result?.exif?.warnings?.length) {
                    result.exif.warnings.forEach((warning) => addWarning(warning));
                }
                diagnostics.metadata.exif = result?.exif || null;
                diagnostics.metadata.persistedMetadata = result?.metadataUpdate || null;
                console.log(`[WORKER] Metadata extraction for job ${job.id} completed.`);
                break;
            case 'supplemental_images':
            case 'historic_images':
            case 'modern_images':
                // Copy and resize image assets first so uploads finish quickly.
                result = await processImageAssets(file, file_model);
                diagnostics.metadata.assets = result?.versions || null;
                if (queue) {
                    await queue.add(
                        {
                            ...job.data,
                            process_type: 'metadata_extract'
                        },
                        {
                            attempts: 5,
                            backoff: {
                                type: 'exponential',
                                delay: 2000,
                            }
                        }
                    );
                    addEvent('info', 'queued_metadata_extract_followup', { processType: 'metadata_extract' });
                }
                console.log(`[WORKER] Image upload for job ${job.id} completed. Result:`, result);
                console.log("Job data for uploadImage:", { file: file.filename, file_model: file_model.image_state, owner: owner.owner_id });
                break;
            default:
                const srcPath = path.join(process.env.MLE_TMP_DIR, file?.filename_tmp);
                const dstPath = path.join(process.env.MLE_UPLOAD_DIR, file?.fs_path);
                console.log(`[WORKER] Copying file source ${srcPath} to ${dstPath}`);
                // Assuming copyFile is an async function that handles its own errors or throws them
                result = await copyFile(srcPath, dstPath);
                diagnostics.metadata.copied = true;
                console.log(`[WORKER] File copy for job ${job.id} completed. Result:`, result);
                break;
        }

        diagnostics.finishedAt = new Date().toISOString();
        addEvent('info', 'job_completed');
        await persistDiagnostics('completed');

        // resolving (finishing) indicates success:
        // return data, which will be accessible via job.returnvalue
        return { success: true, message: 'Job completed successfully', data: result };

    } catch (error) {
        addError(error?.message || String(error));
        diagnostics.finishedAt = new Date().toISOString();
        await persistDiagnostics('failed');
        console.error(`[WORKER] Error processing job ${job?.id}:`, error);
        // Re-throw the error. Bull will catch this, mark the job as failed,
        // and handle retries based on queue options.
        throw error;
    }
};