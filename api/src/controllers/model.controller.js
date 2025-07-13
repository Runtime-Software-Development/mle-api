/*!
 * MLP.API.Controllers.Model
 * File: model.controller.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Controller class for MLP node model data processing. This class has 
 * several methods that handle different aspects of the model's lifecycle:
 * 
 *  - init:     Initializes the controller by creating a new instance of the 
 *              model and setting up services for it.getId: Retrieves the ID of 
 *              the model instance from the request parameters.
 *  - show:     Retrieves a single model instance by ID and returns its data.
 *  - add:      Returns the schema for creating a new model instance.
 *  - create:   Creates a new model instance and saves it to the database.
 *  - edit:     Returns the schema for editing an existing model instance.
 *  - update:   Updates an existing model instance with new data.
 *  - move:     Moves a model instance to a new owner.
 *  - remove:   Deletes a model instance.
 * 
 * The class uses several external services and functions, such as cserve, 
 * nserve, mserve, fserve, and metaserve, which are likely responsible for database 
 * interactions, file uploads, and other tasks. The class also uses a pool 
 * object to manage database connections.
 * 
 * Node types:
 * 
 * Surveyors
 *    |- Surveys
 *      |- SurveySeasons
 *        |- Stations
 *          |- Historic Visits
 *            |- Historic Captures
 *          |- Modern Visits
 *            |- Locations
 *              |- Modern Captures
 *
 * ---------
 * Revisions
 * - [24-08-2024] Updated file importer module to use formidable.
 */


import pool from '../services/db.services.js';
import ModelServices from '../services/model.services.js';
import * as cserve from '../services/construct.services.js';
import * as nserve from '../services/nodes.services.js';
import * as fserve from '../services/files.services.js';
import * as importer from '../services/import.services.js';
import * as metaserve from '../services/metadata.services.js';
import { humanize, sanitize } from '../lib/data.utils.js';
import { isRelatable } from '../services/schema.services.js';
import { deleteComparisons, getComparisonsMetadata, updateComparisons } from "../services/comparisons.services.js";
import { prepare } from '../lib/api.utils.js';


/**
 * Export controller constructor.
 *
 * @param {String} nodeType
 * @src public
 */

export default function ModelController(nodeType) {

    // check node type is not null
    if (!nodeType) throw new Error('invalidModel');

    /**
     * Shared data.
     *
     * @src public
     */

    let constructors, Model, model, mserve;

    /**
     * Initialize the controller: generate services for model
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.init = async () => {
        try {
            // generate all model constructors
            constructors = await cserve.getConstructors();
            // create new model for given node type          
            model = new constructors[nodeType]();
            mserve = new ModelServices(model);
        }
        catch (err) {
            console.error(err);
            throw new Error('invalidModel');;
        }
    }

    /**
     * Get model id value from request parameters. Note: use model
     * route key (i.e. model.key = '<model_name>_id') to reference route ID.
     *
     * @param {Object} params
     * @return {String} Id
     * @src public
     */

    this.getId = function (req) {
        return req.params.hasOwnProperty(model.key)
            ? parseInt(req.params[model.key])
            : null;
    };

    /**
     * Show record data.
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

            // get item node + metadata
            let itemData = await nserve.get(id, nodeType, client);

            // item record and/or node not found in database
            if (!itemData || nodeType !== itemData?.type) return next(new Error('notFound'));

            // get node path
            const path = await nserve.getPath(itemData.node);

            // append second-level dependents (if node depth is above threshold)
            if (model.depth > 1) {
                itemData.dependents = await Promise.all(
                    itemData.dependents.map(async (dependent) => {
                        const { node = {} } = dependent || {};
                        dependent.dependents = await nserve.selectByOwner(node.id, client);
                        dependent.attached = await metaserve.getAttachedByNode(node, client);
                        return dependent;
                    }));
            }

            // include attached metadata
            itemData.attached = await metaserve.getAttachedByNode(itemData.node, client);

            // send response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: model,
                    data: itemData,
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
     * Get model schema to create new record.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.add = async (req, res, next) => {
        const client = await pool.connect();
        try {

            // get owner ID from parameters (if exists)
            let { owner_id = 0 } = req.params || {};

            // update model
            model.setValue('owner_id', owner_id);

            // get path of node in hierarchy
            const owner = await nserve.select(sanitize(owner_id, 'integer'), client);
            const path = await nserve.getPath(owner) || {};

            // send form data response
            res.status(200).json(
                prepare({
                    view: 'new',
                    model: model,
                    data: model.getData(),
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
     * Insert record for model in database and/or upload files.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.create = async (req, res, next) => {

        const client = await pool.connect();
        await client.query('BEGIN');

        try {

            // get the owner of the fileModel (e.g., historic captures are owners of historic images)
            let ownerData = null;
            let filesResult = [];
            let msg = '';
            if (req?.params?.owner_id && model.isRoot) return next(new Error('invalidRequest'));
            else if (req?.params?.owner_id) {
                // Pass client for consistent connection
                ownerData = await nserve.select(req?.params?.owner_id, client); 
                if (!ownerData) return next(new Error('invalidRequest'));
            }

            // receive and parse multi-part files and fields from request
            const {files, model, owner } = await importer.receive(req, nodeType, ownerData);

            console.log('Received files and metadata:', files);
 throw new Error('invalidRequest');

            // Insert new model instance
            const modelInstance = await mserve.insert(model, client);
            msg = `'${modelInstance.label}' ${humanize(model.name)} created successfully!`;

            // Save files and insert file owner records
            if ((files || []).length > 0) {
                filesResult = await fserve.upload(files, modelInstance, client); 
                msg += ` Files submitted to queue for uploading. Refresh the page to see results.`
            }

            // If all operations succeed, commit the transaction
            await client.query('COMMIT');

            // send response
            return res.status(200).json(
                prepare({
                    view: 'show',
                    model: model,
                    data: {
                        files: filesResult,
                        metadata: modelInstance
                    },
                    message: {
                        msg,
                        type: 'success'
                    },
                })
            );

        } catch (err) {
            // If any error occurs, roll back the transaction
            console.error('Transaction failed, rolling back:', err);
            await client.query('ROLLBACK');
            return next(err); // Pass error to Express error handler
        } finally {
            client.release(true); // Always release the client
        }
    }

    /**
     * Get model schema to edit record data.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.edit = async (req, res, next) => {
        const client = await pool.connect();
        try {

            // get node ID from parameters
            const id = this.getId(req);

            // get item data
            let itemData = await nserve.get(id, nodeType, client);

            // item record and/or node not found in database
            const { type = '' } = itemData || {};
            if (!itemData || nodeType !== type) return next(new Error('notFound'));

            // get path of node in hierarchy
            const owner = await nserve.select(id, client);
            const path = await nserve.getPath(owner) || {};

            // send form data response
            res.status(200).json(
                prepare({
                    view: 'edit',
                    model: model,
                    data: itemData,
                    path: path
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Updates database data with imported metadata.
     * - Retrieves node data from parameters.
     * - Processes imported metadata.
     * - Updates database record.
     * - Checks for any dependent updates (e.g. comparisons).
     * - Gets updated item.
     * - Creates node path.
     * - Sends response.
     *
     * @param req
     * @param res
     * @param next
     */
    this.update = async (req, res, next) => {

        const client = await pool.connect();

        try {

            // get node data from parameters
            const id = this.getId(req);
            const itemData = await nserve.get(id, nodeType, client);

            // item record and/or node not found in database
            if (!itemData) return next(new Error('notFound'));

            // process imported metadata
            const { node = {}, metadata = {} } = itemData || {};
            const { owner_id = '', owner_type = '' } = node || {};
            const importedData = await importer.receive(req, owner_id, owner_type);

            // create model instance and inject data
            const item = new Model(metadata);
            item.setData(importedData?.data);

            // update database record
            await mserve.update(item);

            // capture metadata? check for any dependent updates
            if (node.type === 'historic_captures' || node.type === 'modern_captures') {
                const { data = {} } = importedData || {};
                const { historic_captures = {}, modern_captures = {} } = data || {};
                const comparisonCaptures = node.type === 'historic_captures'
                    ? Object.values(modern_captures) : Object.values(historic_captures);
                await updateComparisons(node, comparisonCaptures, client);
            }

            // get updated item
            let updatedItem = await nserve.get(id, nodeType, client);

            // create node path
            const path = await nserve.getPath(node);

            // send response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: model,
                    data: updatedItem,
                    path: path,
                    message: {
                        msg: `'${updatedItem.label}' ${humanize(model.name)} updated successfully!`,
                        type: 'success'
                    },
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Move a capture to a new container (owner).
     *
     * This endpoint expects the following parameters:
     * - id: the ID of the capture to move
     * - owner_id: the ID of the new owner
     *
     * The endpoint verifies that the move is allowed by checking the following:
     * 1. The owner and capture are relatable (i.e. a modern capture can be moved to a location)
     * 2. The capture does not have any comparisons (i.e. it is not part of a comparison set)
     * 3. The capture status is either 'unsorted', 'sorted', or 'missing'
     *
     * If the move is allowed, the endpoint creates a new instance of the capture model, updates the owner ID,
     * and calls the move method of the model service.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */
    this.move = async (req, res, next) => {
        const client = await pool.connect();
        try {

            // get dependent node + owner data
            const id = this.getId(req);
            const { owner_id = null } = req.params || {};
            const itemData = await nserve.get(id, nodeType, client);
            const ownerData = await nserve.select(owner_id, client);

            // item record and/or node/owner not found in database
            const { type = '', status = '', node } = itemData || {};
            if (!ownerData || !itemData || nodeType !== type) return next(new Error('notFound'));

            // is the move allowed? (i.e. check if owner and node are relatable or not repeated)
            // - confirm nodes can be put into requested relation (e.g., modern capture in location)
            // - confirm capture does not have comparisons.
            const comparisons = await getComparisonsMetadata(node, client);
            const isMoveable = await isRelatable(id, owner_id, client);

            if (Array.isArray(comparisons) && comparisons.length > 0)
                return next(new Error('restrictedByComparisons'));
            if (!isMoveable) {
                return next(new Error('invalidMove'));
            }
            if (status !== 'unsorted' && status !== 'sorted' && status !== 'missing') {
                return next(new Error('invalidMove'));
            }

            // create model instance and inject data (update new owner)
            const { metadata = {} } = itemData || {};
            const item = new Model(metadata);

            // move item and dependents to new owner
            const result = await mserve.move(item, ownerData, client);

            // error occurred in capture image transfer
            if (!result) return next(new Error('invalidRequest'));

            // send response
            return res.status(200).json(
                prepare({
                    view: 'show',
                    model: itemData.type,
                    data: itemData,
                    message: {
                        msg: `${humanize(itemData.type)} moved successfully!`,
                        type: 'success'
                    },
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Delete record.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.remove = async (req, res, next) => {
        // pool connection
        const client = await pool.connect();
        try {
            const id = this.getId(req);

            // retrieve item data
            let itemData = await nserve.get(id, nodeType, client);

            // item record and/or node/owner not found in database
            if (!itemData || nodeType !== itemData?.type) return next(new Error('notFound'));

            // force user to delete dependent nodes separately
            // - use error code 23503 from FK violation
            if (itemData?.hasDependents) return next(new Error('23503'));

            // delete any capture comparisons if they exist
            const comparisons = await getComparisonsMetadata(itemData?.node, client);
            if (Array.isArray(comparisons) && comparisons.length > 0) {
                await deleteComparisons(itemData?.node, client);
            }

            // get path of owner node in hierarchy (if exists)
            model.setData(itemData.metadata);
            const owner = await nserve.select(model?.ownerID, client);
            const path = await nserve.getPath(owner);

            // delete item (and attached files, if they exist)
            const result = await mserve.remove(model, client);

            res.status(200).json(
                prepare({
                    view: 'remove',
                    model: model,
                    data: result,
                    message: {
                        msg: `'${itemData.label}' ${humanize(model.name)} deleted successful!`,
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
}