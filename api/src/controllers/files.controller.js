/*!
 * MLP.API.Controllers.Files
 * File: files.controller.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Controller for file services routes.
 *
 * ---------
 * Revisions
 * - 18-11-2023    Added file directory list controller.
 */

/**
 * Module dependencies.
 * @private
 */

import * as db from '../services/index.services.js';
import ModelServices from '../services/model.services.js';
import * as fserve from '../services/files.services.js';
import {getFilePath} from '../services/files.services.js';
import * as nserve from '../services/nodes.services.js';
import * as cserve from "../services/construct.services.js";
import {prepare} from '../lib/api.utils.js';
import pool from '../services/db.services.js';
import {sanitize} from '../lib/data.utils.js';
import * as importer from '../services/import.services.js';

/**
 * Export controller constructor.
 *
 * @param {String} model
 * @src public
 */

let constructors, FileModel, fileModel, fileModelServices;

export default function FilesController(fileModelType) {

    /**
     * Initialize the controller.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.init = async () => {
        try {
            // ignore if no file model type provided
            if (!fileModelType) return;
            // generate all model constructors
            constructors = await cserve.getConstructors();
            // generate model constructor for current file model type
            FileModel = await db.model.create(fileModelType);
            fileModel = new FileModel();
            fileModelServices = new ModelServices(new FileModel());
        } catch (err) {
            console.error(err);
        }
    };

    /**
     * Get file id value from request parameters. Note: use model
     * route key (i.e. model.key = '<model_name>_id') to reference route ID.
     *
     * @param {Object} params
     * @return {String} Id
     * @src public
     */

    this.getId = function(req) {
        try {
            // Throw error if route key is invalid
            return req.params[fileModel.key];
        } catch (err) {
            throw new Error('invalidRouteKey');
        }
    };

    /**
     * Show file data.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.show = async (req, res, next) => {

        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        try {
            // get requested node ID
            let id = this.getId(req);

            // get file data
            const fileData = await fserve.get(id, client);

            const { file = null } = fileData || {};
            const { owner_id = '' } = file || {};

            // get path of owner node in hierarchy
            const owner = await nserve.select(
                sanitize(owner_id, 'integer'), client);

            // file or owner do not exist
            if (!fileData || !owner)
                return next(new Error('notFound'));

            // create node path
            const path = await nserve.getPath(file);

            // get linked data referenced in node tree
            return res.status(200).json(
                prepare({
                    view: 'show',
                    model: fileModel,
                    data: fileData,
                    path: path
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };


    /**
     * Select files and metadata for requested owner node.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.select = async (req, res, next) => {

        const client = await pool.connect();

        try {
            // get owner ID from parameters (if exists)
            const { owner_id = null } = req.params || {};

            // get owner node record and files
            const owner = await nserve.select(owner_id, client);
            let files = await fserve.selectAllByOwner(owner_id) || [];

            // check if files are present in request data
            if (
                Array.isArray(files.historic_images) && files.historic_images.length === 0
                && Array.isArray(files.modern_images) && files.modern_images.length === 0
                && Array.isArray(files.unsorted_images) && files.unsorted_images.length === 0
            ) {
                return next(new Error('noFiles'));
            }

            // send response
            res.status(200).json(
                prepare({
                    view: 'select',
                    model: owner.type,
                    data: files,
                    message: {
                        msg: `${Object.keys(files).length} file types found!`,
                        type: 'success'
                    },
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Retrieves files using ID array filter.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.filter = async (req, res, next) => {

        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        try {

            // get query parameters
            const { ids=''} = req.query || {};

            // sanitize + convert query string to node id array
            const fileIDs = ids
                .split(' ')
                .map(id => {
                    return sanitize(id, 'integer');
                });

            // get filtered results
            const resultData = await Promise.all((
                fileIDs || []).map(async (id) => {
                    const {file_type} = await fserve.select(id, client);
                    const {results} = await fserve.filterFilesByID([id], file_type, 0, 100);
                    const rs = results[0];
                    // include image urls
                    rs.url = fserve.getImageURL(file_type, rs);
                    return rs;
            }));

            res.status(200).json(
                prepare({
                    view: 'filter',
                    data: resultData
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };


    /**
     * Upload files and file metadata.
     * This method handles multi-part file uploads and file metadata.
     * It processes the request in a transaction to ensure data integrity.
     * - If the request contains an owner_id, it retrieves the owner node.
     * - It receives and parses multi-part files and fields from the request.
     * - It saves the files and inserts file metadata records.
     * - For example: /historic_images/new/30951 creates a new historic images upload for
     *   the owner node with ID 30951, which is an historic captures node.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.upload = async (req, res, next) => {

        const client = await pool.connect();
        await client.query('BEGIN');

        try {

            // get the owner of the fileModel (e.g., historic captures are owners of historic images)
            let ownerData = null;
            let filesResult = null;
            if (req?.params?.owner_id && fileModel.isRoot) return next(new Error('invalidRequest'));
            else if (req?.params?.owner_id) {
                // Pass client for consistent connection
                ownerData = await nserve.select(req?.params?.owner_id, client); 
                if (!ownerData) return next(new Error('invalidRequest'));
            }

            // Receive and parse multi-part files and fields from form request data
            const {files, model, owner} = await importer.receive(req, fileModelType, ownerData);

            // Save files and insert file owner records
            if ((files || []).length > 0) {
                // update each item with owner data
                await Promise.all(files.map( async(fileData) => {
                    // create file model and file node constructors
                    const fileConstructor = await cserve.create('files');
                    const fileNode = new fileConstructor(fileData.file);
                    const fileModelConstructor = await cserve.create(fileData.file_type);
                    const fileModel = new fileModelConstructor(fileData.file_model);
                    // console.log('Updating owner of file:', fileNode.getValue('filename') || 'Unknown');
                    // overwrite file data with file node
                    fileData.file = fileNode;
                    // overwrite file data with file model
                    fileData.file_model = fileModel;
                }));
                // Save files and insert file metadata records
                filesResult = await fserve.upload(files, owner, client);
            }

            // If all operations succeed, commit the transaction
            await client.query('COMMIT');

            // send response
            return res.status(200).json(
                prepare({
                    view: 'show',
                    model: fileModel,
                    data: {
                        files: filesResult,
                        metadata: model.getData()
                    },
                    message: {
                        msg: `Files submitted to queue for uploading. Refresh the page to see results.`,
                        type: 'success'
                    },
                })
            );

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Get file schema to edit record data.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.edit = async (req, res, next) => {

        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        try {

            // get node ID from parameters
            const id = this.getId(req);

            // get file data
            const fileData = await fserve.get(id, client);

            // check that file entry exists
            if (!fileData) {
                return next(new Error('notFound'));
            }

            // get path of owner node in hierarchy
            const { file = null } = fileData || {};
            const path = await nserve.getPath(file);

            // send form data response
            res.status(200).json(
                prepare({
                    view: 'edit',
                    model: fileModel,
                    data: fileData,
                    path: path
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Update file metadata.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.update = async (req, res, next) => {

        const client = await pool.connect();

        try {

            // get file data from parameters
            const id = this.getId(req);
            const fileData = await fserve.get(id, client);

            // check that file entry exists
            if (!fileData) {
                return next(new Error('invalidRequest'));
            }

            // get metadata fields
            const {metadata='', file=''} = fileData || {};
            const {owner_id='', owner_type='', file_type=''} = file || {};
            const ownerData = nserve.select(owner_id, client);
            // receive and parse multi-part files and fields from request
            const importedData = await importer.receive(req, fileModelType, ownerData);

            // overwrite metadata
            Object.keys(importedData.data).forEach((field) => {
                metadata[field] = importedData.data[field];
            });

            // update owner in file metadata model
            const fileNode = new FileModel(metadata);
            const FileModel = await cserve.create(file_type);
            const fileMetadata = new FileModel(metadata);

            // update file metadata record
            await fserve.update(fileNode, fileMetadata, client);

            // get updated file
            let updatedItem = await fserve.get(id, client);

            // get path of owner node in hierarchy
            const path = await nserve.getPath(file);

            // send response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: fileModel,
                    data: {},
                    message: {
                        msg: `'${updatedItem.label}' updated successfully!`,
                        type: 'success'
                    },
                    path: path
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Delete single file and file metadata.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.remove = async (req, res, next) => {

        const client = await pool.connect();

        try {
            const id = this.getId(req);

            // retrieve item data and create a file instance
            let file = await fserve.get(id, client);

            // check if node is valid (exists)
            if (!file) return next(new Error('notFound'));

            // delete file + file model metadata
            const result = await fserve.remove(file, client);

            res.status(200).json(
                prepare({
                    view: 'remove',
                    model: fileModel,
                    data: result,
                    message: {
                        msg: `'${file.label}' deleted successful!`,
                        type: 'success'
                    }
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Download file without compression (for unauthenticated downloads).
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.download = async (req, res, next) => {

        const client = await pool.connect();

        try {
            // get requested file ID
            const {id} = req.params || {};

            // get file path (images require secure token)
            const fileData = await fserve.get(id, client);
            const { file={}, metadata={} } = fileData || {};
            const { filename='', mime_type='' } = file || {};
            const { secure_token='' } = metadata || {};
            file.secure_token = secure_token;
            const filePath = getFilePath(file);

            // file does not exist
            if (!file) return next(new Error('invalidRequest'));

            res.setHeader('Content-disposition', 'attachment; filename=' + filename);
            res.setHeader('Content-type', mime_type);

            await fserve.download(res, filePath);

        } catch (err) {
            return next(err);
        } finally {
            client.release(true);
        }
    };


    /**
     * Bulk download files (compressed folder downloads).
     * - File IDs are passed in query string by file type
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.bulk = async (req, res, next) => {

        const client = await pool.connect();

        try {
            await fserve.bulkDownload(req, res, next, 'medium', client);
        } catch (err) {
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Bulk download raw files (compressed folder downloads).
     * - File IDs are passed in query string by file type
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.raw = async (req, res, next) => {

        const client = await pool.connect();

        try {
            await fserve.bulkDownload(req, res, next, 'raw', client);
        } catch (err) {
            return next(err);
        } finally {
            client.release(true);
        }
    };

    /**
     * Lists files in directory by file path.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.directory = async (req, res, next) => {
        try {

            // get query parameters
            const { path='/'} = req.query || {};

            // get directory listing results
            fserve.listFiles(path, (err, resultData) => {
                if (err) return next(new Error('invalidRequest'));
                res.status(200).json(
                    prepare({
                        view: 'filter',
                        data: resultData
                    }));
            });

        } catch (err) {
            console.error(err)
            return next(err);
        }
    };

}



