/*!
 * MLP.API.Services.Construct
 * File: construct.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description: Create derived model through composition. The model schema
 * should have attributes that match the database table. 
 * 
 * Data Model:
 *  - Surveyors
 *    |- Surveys
 *      |- SurveySeasons
 *        |- Stations
 *          |- Historic Visits
 *            |- Historic Captures
 *          |- Modern Visits
 *            |- Locations
 *              |- Modern Captures
 *  - Projects
 *    |- Stations
*       |- Historic Visits
*          |- Historic Captures
*        |- Modern Visits
*          |- Locations
*            |- Modern Captures

 * - Map Feature Groups
 *    |- Map Feature
 * 
 */

'use strict';

import path from 'path';
import { humanize, sanitize } from '../lib/data.utils.js';
import * as schemaConstructor from './schema.services.js';
import { select as nselect } from './nodes.services.js';
import pool from "./db.services.js";

/**
 * Create derived model through composition. The model schema
 * should have attributes that match the database table.
 *
 * @param {String} modelType
 * @src public
 */

/**
 * Create derived model through composition. The model schema
 * should have attributes that match the database table.
 *
 * @param {String} modelType
 * @return {Object} model constructor
 * @src public
 */
export const create = async (modelType) => {

    // generate schema for constructor type
    let Schema = await schemaConstructor.create(modelType);
    const schema = new Schema();
    let NodeSchema = await schemaConstructor.create('nodes');
    const nodeSchema = new NodeSchema();
    let FileSchema = await schemaConstructor.create('files');
    const fileSchema = new FileSchema();

    // return constructor
    return function (attributeValues) {

        // static variables
        this.name = modelType;
        this.key = `${modelType}_id`;
        this.idKey = schema.idKey;
        this.label = schemaConstructor.genLabel(modelType, attributeValues);
        this.attributes = schema.attributes;
        this.nodeAttributes = nodeSchema.attributes;
        this.fileAttributes = fileSchema.attributes;
        this.isRoot = schema.rootNodeTypes.includes(modelType);
        this.depth = schema.nodeDepth.hasOwnProperty(modelType)
            ? schema.nodeDepth[modelType]
            : schema.nodeDepth.default;
        // set filesystem root (if root node)
        this.fsRoot = schema.fsRoot.hasOwnProperty(modelType)
            ? schema.fsRoot[modelType]
            : '';
        this.nodeModel = null;
        this.fileModel = null;
        this.isNode = modelType === 'nodes';
        this.isFile = modelType === 'files';

        // initialize model with input data
        this.setData = setData;
        this.setData(attributeValues);

        // method definitions
        Object.defineProperties(this, {

            /**
             * Get/set node/file id value.
             *
             * @return {Object} field data
             * @src public
             */
            id: {
                get: () => {
                    return schema.idKey && this.attributes[schema.idKey].value || '';
                },
                set: (id) => {
                    this.attributes[schema.idKey || 'unknown'].value = id;
                }
            },

            /**
             * Check for existence of attribute in model.
             *
             * @return {Object} field data
             * @src public
             */
            hasAttribute: {
                value: (attr) => {
                    return schema.attributes.hasOwnProperty(attr);
                },
                writable: true
            },

            /**
             * Add a new attribute to the model.
             *
             * @return {Object} field data
             * @src public
             */
            addAttribute: {
                value: (name, type, value = null) => {
                    this.attributes[name] = {
                        value: value,
                        key: name,
                        label: humanize(name),
                        type: type,
                    };
                },
                writable: true
            },

            /**
             * Get/set the nodes reference data (if exists).
             *
             * @return {Object} field data
             * @src public
             */
            nodeID: {
                get: () => {
                    return schema.attributes.hasOwnProperty('nodes_id')
                        ? this.attributes['nodes_id']
                        : null;
                },
                set: (data) => {
                    if (schema.attributes.hasOwnProperty('nodes_id'))
                        this.attributes['nodes_id'].data = data;
                }
            },

            /**
             * Get/set the files reference data (if exists).
             *
             * @return {Object} field data
             * @src public
             */
            fileID: {
                get: () => {
                    return schema.attributes.hasOwnProperty('files_id')
                        ? this.attributes['files_id']
                        : null;
                },
                set: (data) => {
                    if (schema.attributes.hasOwnProperty('files_id'))
                        this.attributes['files_id'].data = data;
                }
            },

            /**
             * Get/set the node/file owner data.
             *
             * @return {Object} field data
             * @src public
             */
            ownerID: {
                get: () => {
                    return schema.attributes.hasOwnProperty('owner_id')
                        ? sanitize(this.attributes['owner_id'].value, 'integer')
                        : null;
                },
                set: (id) => {
                    if ((typeof id === 'number' || typeof id === 'string') && this.attributes.hasOwnProperty('owner_id')) {
                        this.attributes['owner_id'].value = sanitize(id, 'integer');
                    }
                }
            },

            /**
             * Get field value from model attributes.
             *
             * @param {String} field
             * @return {Object} field data
             * @src public
             */
            getValue: {
                value: (field = null) => {
                    return field && this.attributes.hasOwnProperty(field)
                        ? this.attributes[field].value
                        : null;
                },
                writable: false
            },

            /**
             * Set field value in model schema.
             *
             * @param {String} key
             * @param {Object} value
             * @src public
             */
            setValue: {
                value: (key, value) => {
                    if (typeof key === 'string' && this.attributes.hasOwnProperty(key)) {
                        this.attributes[key].value = sanitize(value, this.attributes[key].type);
                    }
                },
                writable: false
            },

            /**
             * Get/set node object attached to model.
             *
             * @param {String} field
             * @return {Object} field data
             * @src public
             */
            node: {
                get: () => {
                    // TODO: check if node exists in model
                    return this.nodeModel
                },
                set: (obj) => {
                    this.nodeModel = obj;
                }
            },

            /**
             * Get/set file object attached to model.
             *
             * @param {String} field
             * @return {Object} field data
             * @src public
             */
            file: {
                get: () => {
                    // TODO: check if file exists in model
                    return this.fileModel
                },
                set: (obj) => {
                    this.fileModel = obj;
                }
            },


            /**
             * Get field values from model. Optional filter array
             * omits select attributes from result.
             *
             * @return {Object} filtered data
             * @param {Array} filter
             * @src public
             */
            getData: {
                value: (filter = []) => {
                    return Object.keys(this.attributes)
                        .filter(key => !filter.includes(key))
                        .reduce((o, key) => {
                            o[key] = this.attributes[key].value; return o
                        }, {});
                },
                writable: false
            },

            /**
             * Clear attributes of all values.
             *
             * @src public
             */
            clear: {
                value: () => {
                    this.attributes = Object.keys(this.attributes)
                        .map(key => {
                            this.attributes[key].value = null;
                        });
                },
                writable: false
            }
        });
    }
};


/**
 * Sets values of model attributes.
 *
 * @param {Object} data
 * @return {this}
 * @src public
 */
function setData(data = null) {

    // select object-defined data
    if (typeof data === 'object' && data !== null) {

        // NOTE: model can only hold data for single record
        // select either first row of data array or single data object
        const inputData = data.hasOwnProperty('rows') ? data.rows[0] : data;

        // assert attributes exist in model schema
        // NOTE: we silently ignore attributes not present in model schema
        Object.keys(inputData)
            .filter(key => !(this.attributes && this.attributes.hasOwnProperty(key)))
            .map(key => {
                console.warn(`Attribute key \'${key}\' was not in model schema for \'${this.name}\'.`);
            });

        // set attribute values from data
        Object.keys(inputData)
            .filter(key => this.attributes && this.attributes.hasOwnProperty(key))
            .map(key => this.attributes[key].value =
                sanitize(inputData[key], this.attributes[key].type));
    }

    return this;
}

/**
 * Generates node object from given model instance.
 *
 * @public
 * @params {Object} item
 * @return {Promise} result
 */

export const createNode = async function (item) {

    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        if (!item.nodeID) return null;

        // generate node constructor
        let Node = await create('nodes');

        // get owner attributes (if they exist)
        const { owner = {} } = item || {};
        const { value = '' } = owner || {};
        let ownerAttrs = await nselect(value, client) || owner;
        const { id = null, type = null, fs_path = item.fsRoot } = ownerAttrs || {};

        // create new filesystem path using generated node label
        // - only return alphanumeric characters (also: '_', '-')
        const fsPath = path.join(
            fs_path,
            item.label.replace(' ', '_').replace(/[^a-z0-9_-]/gi, '')
        );

        // return node instance: set owner attribute values from
        // retrieved node attributes
        return new Node({
            id: item.id,
            type: item.name,
            owner_id: id,
            owner_type: type,
            fs_path: fsPath
        });

    } catch (err) {
        console.error(err)
        throw err;
    } finally {
        client.release(true);
    }
};

/**
 * Generates file object from given model instance
 * and file metadata.
 *
 * @public
 * @params {Object} item
 * @return {Promise} result
 */

export const createFile = async function (fileData) {

    if (!fileData) return null;

    // generate file constructor
    let File = await create('files');

    // get additional file metadata from item
    const {
        id = '',
        file_type = '',
        filename = '',
        mimetype = '',
        owner_type = '',
        owner_id = '',
        fs_path = '',
        file_size = 0,
        filename_tmp = ''
    } = fileData || {};


    // return file instance: set owner attribute values from
    // retrieved node attributes
    return new File({
        id: id,
        file_type: file_type,
        filename: filename,
        file_size: file_size,
        mimetype: mimetype,
        owner_id: owner_id,
        owner_type: owner_type,
        fs_path: fs_path,
        filename_tmp: filename_tmp
    });
};


/**
 * Returns a Promise that resolves to an object containing all
 * model constructors, where each key is the singular model name
 * and the value is the model constructor.
 * 
 * @public
 * @return {Promise} result
 */
export const getConstructors = async function () {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        // create model constructor for all node types
        const nodeTypes = await schemaConstructor.getNodeTypes(client);
        const fileTypes = await schemaConstructor.getFileTypes(client);
        const fileRelations = await schemaConstructor.getFileOwnerType(client);
        // generate constructors for each node type
        const constructors = {};
        await Promise.all(nodeTypes.map(async (nodeType) => {
            // add constructor to the constructors object
            constructors[nodeType] = await create(nodeType);
        }));
        // generate constructors for each file type
        await Promise.all(fileTypes.map(async (fileType) => {
            // add constructor to the constructors object
            constructors[fileType] = await create(fileType);
        }));
        // generate constructors for files and nodes
        constructors['files'] = await create('files');
        constructors['nodes'] = await create('nodes');
        constructors['options'] = fileRelations;

        return constructors;

    } catch (err) {
        console.error(err)
        throw err;
    } finally {
        client.release(true);
    }

}



// src/lib/importedRecordContext.js

/**
 * A convenience class to encapsulate all data related to a single imported record,
 * including its primary model, associated node, files, and owner.
 */
export class ModelContext {
    /**
     * @param {object} mainModel - The primary model instance (e.g., HistoricCapture instance).
     * @param {object|null} nodeModel - The associated node instance for the main model, if applicable.
     * @param {Array<object>} fileObjects - An array of objects, each containing `{ file: FileInstance, file_model: FileModelInstance, file_type: string, encoding: string }`.
     * @param {object|null} ownerData - The owner data (e.g., Surveyor, Project instance).
     */
    constructor(mainModel, nodeModel, fileObjects, ownerData) {
        if (!mainModel) {
            throw new Error('ModelContext requires a mainModel instance.');
        }

        this._mainModel = mainModel;
        this._nodeModel = nodeModel;
        this._fileObjects = fileObjects || [];
        this._ownerData = ownerData;
    }

    /**
     * Get the primary model instance (e.g., HistoricCapture instance).
     * This is the `model` that was parsed from the main form fields.
     * @returns {object} The primary model instance.
     */
    getMainModel() {
        return this._mainModel;
    }

    /**
     * Get the associated Node model instance (e.g., Station, HistoricVisit).
     * This represents the node in the hierarchy that the `mainModel` belongs to,
     * or the `mainModel` itself if it's a node.
     * @returns {object|null} The Node model instance, or null if not applicable.
     */
    getNodeModel() {
        return this._nodeModel;
    }

    /**
     * Get the array of file objects associated with this import.
     * Each object contains the instantiated file and its associated file_model metadata.
     * @returns {Array<object>} An array of objects like
     * `{ file: FileInstance, file_model: FileModelInstance, file_type: string, encoding: string }`.
     */
    getFileObjects() {
        return this._fileObjects;
    }

    /**
     * Get the owner data for the import.
     * This is the `owner` object passed to `importer.receive`.
     * @returns {object|null} The owner data.
     */
    getOwnerData() {
        return this._ownerData;
    }

    /**
     * Get the ID of the main model.
     * @returns {string|number|null}
     */
    getMainModelId() {
        return this._mainModel.id || null;
    }

    /**
     * Get the ID of the owner.
     * @returns {string|number|null}
     */
    getOwnerId() {
        return this._ownerData?.id || null;
    }

    /**
     * Get the data of the main model as a plain object.
     * @param {Array<string>} [filter=[]] - Optional array of keys to exclude from the data.
     * @returns {object}
     */
    getMainModelData(filter = []) {
        return this._mainModel.getData(filter);
    }

    // You can add more convenience methods here as your needs evolve,
    // for example, to retrieve specific types of files, or related data.
    // getImages() { return this._fileObjects.filter(f => f.file_type.includes('_images')); }
}


// In your controller file (e.g., this.create method)

// --- New Import ---
import { ImportedRecordContext } from '../lib/importedRecordContext.js'; // Adjust path as needed
// --- Existing Import (ensure createNode is correctly imported/accessed) ---
import { createNode as createNodeService } from '../services/construct.services.js'; // Alias to avoid conflict if `create` also exists


// Define cleanupTempFiles function (as provided in previous response)
// This function needs access to fs, path, and process.env.MLE_TMP_DIR
const cleanupTempFiles = async (fileObjects) => {
    if (!fileObjects || fileObjects.length === 0) return;
    for (const fileObj of fileObjects) {
        if (fileObj?.file?.filename_tmp) {
            const tempFilePath = path.join(process.env.MLE_TMP_DIR, fileObj.file.filename_tmp);
            try {
                await fs.promises.unlink(tempFilePath);
                console.log(`Cleaned up temporary file: ${tempFilePath}`);
            } catch (cleanupErr) {
                console.error(`Failed to clean up temporary file ${tempFilePath}:`, cleanupErr);
                // Log but don't re-throw; cleanup failure shouldn't mask original error
            }
        }
    }
};

/**
 * Insert record for model in database and/or upload files.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */
this.create = async (req, res, next) => {
    const client = await pool.connect();
    // Begin a database transaction
    await client.query('BEGIN');

    let importedFilesForCleanup = []; // To store file objects for potential cleanup

    try {
        let owner = null;

        // 1. Owner validation and instantiation
        if (req?.params?.owner_id && model.isRoot) {
            return next(new Error('invalidRequest: Cannot set owner_id for root nodes.'));
        } else if (req?.params?.owner_id) {
            const ownerData = await nserve.select(req?.params?.owner_id, client); // Pass client
            if (!ownerData) {
                return next(new Error('invalidRequest: Owner not found for non-root node.'));
            }
            // Create model instance of owner (proximate node)
            owner = new constructors[ownerData?.type]();
            owner.id = ownerData?.id;
            owner.node = ownerData; // Assign raw node data or process it as needed
        }

        // 2. Import and parse multi-part form data using the promisified importer
        // importer.receive returns { model: mainModelInstance, files: [...], owner: ownerInstance }
        const importedResult = await importer.receive(req, model, owner);

        // Store the file objects for potential cleanup later
        importedFilesForCleanup = importedResult.files || [];

        // 3. Determine/create the associated Node instance for the context
        let nodeInstance = null;
        if (importedResult.model.nodeID) { // Check if the main model type has a 'nodes_id' attribute
            // createNodeService generates a Node instance based on the provided model instance
            nodeInstance = await createNodeService(importedResult.model);
        } else if (importedResult.model.isNode) { // If the main model itself IS a node
            nodeInstance = importedResult.model;
        }
        // If it's a root model with no node association, nodeInstance will remain null.

        // 4. Create the centralized ImportedRecordContext object
        const importedContext = new ImportedRecordContext(
            importedResult.model, // The main model instance
            nodeInstance,         // The associated node instance
            importedFilesForCleanup, // The array of file objects
            importedResult.owner  // The owner data
        );

        // --- Now, use the data from the `importedContext` object for subsequent operations ---

        // 5. Insert main model instance into the database
        // `mserve.insert` should accept the database client for the transaction
        const modelInserted = await mserve.insert(importedContext.getMainModel(), client);

        // Update the context's main model with its newly assigned ID from the database if needed.
        // Assuming mserve.insert returns the model instance with its new ID.
        importedContext.getMainModel().id = modelInserted.id;


        // 6. Save files and insert file owner records
        // `fserve.upload` should accept the database client for the transaction.
        // The owner of the files is typically the `modelInserted` (the newly created record).
        const filesUploadedResult = await fserve.upload(
            importedContext.getFileObjects(),
            importedContext.getMainModel(), // Pass the newly inserted model as the owner for its files
            client
        );

        // 7. Commit the database transaction if all operations succeed
        await client.query('COMMIT');

        // 8. Clean up temporary files after successful processing and database commit
        // This relies on the Queue Processor moving files AND your cleanupTempFiles deleting the tmp version.
        await cleanupTempFiles(importedFilesForCleanup);

        // 9. Send the success response
        return res.status(200).json(
            prepare({
                view: 'show',
                model: importedContext.getMainModel(), // Use the final model from the context
                data: {
                    files: filesUploadedResult,
                    metadata: importedContext.getMainModelData()
                },
                message: {
                    msg: `Files submitted to queue for uploading. Refresh the page to see results.`,
                    type: 'success'
                },
            })
        );

    } catch (err) {
        // Roll back the database transaction on any error
        console.error('Transaction failed, rolling back:', err);
        await client.query('ROLLBACK');

        // Clean up temporary files on failure
        await cleanupTempFiles(importedFilesForCleanup);

        // Pass the error to the Express error-handling middleware
        return next(err);
    } finally {
        // Always release the database client
        client.release(true);
    }
};