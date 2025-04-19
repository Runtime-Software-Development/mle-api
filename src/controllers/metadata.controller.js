/*!
 * MLP.API.Controllers.Metadata
 * File: metadata.controller.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Controller for MLP model nodes.
 *
 * ---------
 * Revisions
 * - 25-08-2023   Streamline participant group upsert/deletion controller and services.
 */
/**
 * Module dependencies.
 * @private
 */

import * as cserve from '../services/construct.services.js';
import * as nserve from '../services/nodes.services.js';
import * as metaserve from '../services/metadata.services.js';
import { prepare } from '../lib/api.utils.js';
import pool from '../services/db.services.js';
import {humanize, sanitize} from '../lib/data.utils.js';
import * as fserve from '../services/import.services.js';
import {getParticipantGroupTypes} from "../services/schema.services.js";


/**
 * Export controller constructor.
 *
 * @param {String} metadataType
 * @src public
 */

export default function MetadataController(metadataType) {

    /**
     * Shared data.
     *
     * @src public
     */

    let Metadata, metadataModel;

    // check metadata type is not null
    if (!metadataType) throw new Error('invalidMetadataType');

    /**
     * Initialize the controller: generate services for model
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.init = async (req, res, next) => {
        try {
            Metadata = await cserve.create(metadataType);
            metadataModel = new Metadata();
        }
        catch (err) {
            return next(err);
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

    this.getId = function(req) {
        return req.params.hasOwnProperty(metadataModel.key)
            ? parseInt(req.params[metadataModel.key])
            : null;
    };
    this.getOwnerId = function(req) {
        return req.params.hasOwnProperty('owner_id')
            ? parseInt(req.params['owner_id'])
            : null;
    };

    /**
     * Get metadata options.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.settings = async (req, res, next) => {
        try {
            res.status(200).json(
                prepare({
                    view: 'settings',
                    data: await metaserve.getAllSettings()
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        }
    };

    /**
     * Get metadata options.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.options = async (req, res, next) => {
        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        try {
            res.status(200).json(
                prepare({
                    view: 'options',
                    data: await metaserve.getMetadataOptions(client)
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        }
        finally {
            await client.release(true);
        }
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

            // get item metadata and filter through instance
            let data = await metaserve.select(sanitize(id, 'integer'), metadataModel, client);
            const item = new Metadata(data);

            // item record and/or node not found in database
            if (!item) return next(new Error('notFound'));

            res.status(200).json(
                prepare({
                    view: 'show',
                    data: item.getData(),
                    model: item
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Insert record in database.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.create = async (req, res, next) => {

        const client = await pool.connect();

        try {
            const ownerID = this.getOwnerId(req);
            let ownerType = null;

            // get owner ID from parameters
            if (ownerID) {
                // get owner metadata record (if exists)
                const owner = await nserve.select(ownerID, client);
                // check owner exists
                if (!owner) return next(new Error('invalidRequest'));
                // update owner type
                ownerType = owner.type;
            }

            // filter metadata through importer
            // - saves any attached files to library
            // - collates metadata
            const mdData = await fserve.receive(req, ownerID, ownerType);
            let item = new Metadata(mdData.data);
            const data = await metaserve.insert(item, false, client);

            // send create response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: data,
                    message: {
                        msg: `${metadataModel.label || humanize(metadataType)} record created successfully!`,
                        type: 'success'
                    }
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Update database data.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.update = async (req, res, next) => {

        const client = await pool.connect();

        try {
            let ownerType = null;
            let ownerID = null;

            // get item ID from parameters
            const id = this.getId(req);
            // get item metadata
            const selectData = await metaserve.select(sanitize(id, 'integer'), metadataModel, client);

            // check relation exists for file type and node type
            if (!selectData) return next(new Error('invalidRequest'));
            // get owner node; check that node exists in database
            // and corresponds to requested owner type.
            const owner = await nserve.select(selectData.owner_id, client);
            if (owner) {
                ownerID = owner.id;
                ownerType = owner.type;
            }

            // create metadata item from request data
            const mdData = await fserve.receive(req, ownerID, ownerType);
            let item = new Metadata(mdData.data);

            // include requested ID / owner ID
            item.id = id;
            item.owner = ownerID;

            // do the record update
            const data = await metaserve.update(item, metadataModel, client);

            // send create response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: data,
                    message: {
                        msg: `${metadataModel.label || humanize(metadataType)} record updated successfully!`,
                        type: 'success'
                    }
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

        const client = await pool.connect();

        try {

            // get owner ID from parameters (if exists)
            const id = this.getId(req);
            // get item metadata
            const selectData = await metaserve.select(sanitize(id, 'integer'), metadataModel, client);
            // check relation exists for file type and node type
            if (!selectData)
                return next(new Error('invalidRequest'));
            // retrieve item data
            let item = new Metadata(selectData);
            // delete the item
            const data = await metaserve.remove(item, client);

            // send response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: data,
                    message: {
                        msg: `${metadataModel.label || humanize(metadataType)} record deleted successfully!`,
                        type: 'success'
                    }
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Show participant metadata.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.showParticipants = async (req, res, next) => {

        // NOTE: client undefined if connection fails.
        const client = await pool.connect();

        try {

            // get requested node ID
            // get owner ID & group type from parameters
            const ownerID = this.getId(req);

            // get item metadata and filter through instance
            let metadata = await metaserve.selectByOwner(sanitize(ownerID, 'integer'), metadataType, client);

            // metadata record not found in database
            if (!metadata || !ownerID ) return next(new Error('notFound'));

            // retrieve participants for all participant groups attached to owner
            const pgroups = await metaserve.getParticipantGroups(ownerID, null, client);

            // map participant metadata to value/label pairs
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: Object.keys(pgroups).reduce((o, key) => {
                        o[key] = pgroups[key].map(p => {
                            return {label: p.full_name, value: p.id }
                        });
                        return o;
                    }, {})
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Insert grouped records.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.updateParticipants = async (req, res, next) => {

        const client = await pool.connect();

        try {

            // get owner ID from parameters
            const ownerID = this.getId(req) || this.getOwnerId(req);

            // get owner metadata record
            const owner = await nserve.select(sanitize(ownerID, 'integer'), client);

            // check owner exists
            if (!owner) return next(new Error('invalidRequest'));

            // filter request through data importer
            const inputMetadata = await fserve.receive(req, owner.id, owner.type);

            // process input request data for participant groups
            // data: {
            //     hiking_party: { '0': '<ID_0>', '1': '<ID_1>', ... },
            //     field_notes_authors: { '0': '<ID_0>', '1': '<ID_1>', ... },
            //     photographers: { '0': '<ID_0>', '1': '<ID_1>', ... },
            //     owner_id: <OWNER_ID>
            // }

            // process each group type
            const result = [];
            const groupTypes = await getParticipantGroupTypes(client);
            await Promise.all(groupTypes.map( async(groupType) => {
                // Create new participant groups in request
                // - creates new group for participants sent in request
                // - OR adds participants to existing groups
                let newParticipants;
                if (inputMetadata.data.hasOwnProperty(groupType)) {
                    newParticipants = Object.values(inputMetadata.data[groupType]).map(id => {
                        return {
                            participant_id: id,
                            owner_id: ownerID,
                            group_type: groupType
                        };
                    });
                    result.push(await metaserve.updateGroup(newParticipants, metadataModel.name, owner.id, groupType));
                }
                // delete the group if no participants are in request
                else {
                    // remove all participants in each group
                    await metaserve.updateGroup([], metadataModel.name, owner.id, groupType, 'participant_id');
                    // remove the group
                    result.push(await metaserve.removeGroup(owner.id, metadataType, groupType, client));
                }
            }));

            // send create response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: result,
                    message: {
                        msg: `${metadataModel.label || humanize(metadataType)}: Updated successfully!`,
                        type: 'success'
                    }
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };

    /**
     * Delete grouped records by owner ID.
     *
     * @param req
     * @param res
     * @param next
     * @src public
     */

    this.removeParticipants = async (req, res, next) => {
        const client = await pool.connect();
        try {

            // get owner ID & group type from parameters
            const ownerID = this.getId(req);

            // check that owner exists
            if (!await metaserve.selectByOwner(sanitize(ownerID, 'integer'), metadataType, client))
                return next(new Error('invalidRequest'));

            // remove all participants in each group
            let result;
            const groupTypes = await getParticipantGroupTypes(client);
            await Promise.all(groupTypes.map( async(groupType) => {
                await metaserve.updateGroup([], metadataModel.name, ownerID, groupType, 'participant_id');
            }));

            // remove the groups
            await Promise.all(groupTypes.map( async(groupType) => {
                result = await metaserve.removeGroup(ownerID, metadataType, groupType, client);
            }));


            // send response
            res.status(200).json(
                prepare({
                    view: 'show',
                    model: metadataModel,
                    data: result,
                    message: {
                        msg: `Participant groups deleted successfully!`,
                        type: 'success'
                    }
                }));

        } catch (err) {
            console.error(err)
            return next(err);
        } finally {
            await client.release(true);
        }
    };


}