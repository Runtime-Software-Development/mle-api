/*!
 * Core.API.Router.Files
 * File: files.routes.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * File controller routes settings.
 *
 * ---------
 * Revisions
 * - 18-11-2023    Added admin-only list of files paths.
 */


/**
 * Module dependencies
 */

import path from 'path';
import FilesController from '../controllers/files.controller.js'
import { getFileTypes } from '../services/schema.services.js';

/**
 * Files routes constructor
 *
 * @public
 */

function FilesRoutes(modelType) {

    // create model identifier key
    this.model = modelType;
    this.key = `${modelType}_id`;

    // initialize model controller
    this.controller = new FilesController(modelType);

    // add controller routes
    this.routes = {
        show: {
            path: path.join('/', this.model, 'show', ':' + this.key),
            get: this.controller.show,
            put: null,
            post: null,
            delete: null,
        },
        filter: {
            path: path.join('/files/filter'),
            get: this.controller.filter,
            put: null,
            post: null,
            delete: null,
        },
        search: {
            path: path.join('/files/select/:owner_id'),
            get: this.controller.select,
            put: null,
            post: null,
            delete: null,
        },
        create: {
            path: path.join('/', this.model, 'new', ':owner_id'),
            get: null,
            put: null,
            post: this.controller.upload,
            delete: null,
        },
        edit: {
            path: path.join('/', this.model, 'edit', ':' + this.key),
            get: this.controller.edit,
            put: null,
            post: this.controller.update,
            delete: null,
        },
        remove: {
            path: path.join('/', this.model, 'remove', ':' + this.key),
            get: null,
            put: null,
            post: null,
            delete: this.controller.remove,
        },
        raw: {
            path: '/files/download/raw',
            get: this.controller.raw,
            put: null,
            post: null,
            delete: null,
        },
        export: {
            path: '/files/download/bulk',
            get: this.controller.bulk,
            put: null,
            post: null,
            delete: null,
        },
        download: {
            path: path.join('/files/download/:id'),
            get: this.controller.download,
            put: null,
            post: null,
            delete: null,
        },
        settings: {
            path: path.join('/files/list/'),
            get: this.controller.directory,
            put: null,
            post: null,
            delete: null,
        }
    };
}

/**
 * Files routes initialization. Routes only generated for
 * defined models in the file_types relation.
 */

export default async function generate(client) {
    let routes = [];
    await getFileTypes(client)
        .then(fileTypes => {
            fileTypes.map(fileType => {
                // add routes instance to array
                routes.push(new FilesRoutes(fileType));
            });
        })
        .catch(err => {throw err});
    return routes;
}