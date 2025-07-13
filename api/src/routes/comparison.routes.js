/*!
 * Core.API.Router.Master
 * File: master.routes.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies
 */

import path from 'path';
import ComparisonController from '../controllers/comparison.controller.js';


/**
 * Master routes constructor
 *
 * @public
 */

function ComparisonRoutes() {

    // initialize model controller
    this.controller = new ComparisonController();

    // add controller routes
    // include master endpoint for modern capture images
    this.routes = {
        filter: {
            path: path.join('/compare/filter'),
            get: this.controller.filter,
            put: null,
            post: null,
            delete: null,
        },
        compare: {
            path: path.join('/compare/:id'),
            get: this.controller.select,
            put: null,
            post: null,
            delete: null,
        },
        master: {
            path: path.join('/master'),
            get: this.controller.register,
            put: null,
            post: this.controller.master,
            delete: null,
        }
    };
}


/**
 * Master routes initialization. Routes only generated for
 * defined models used in image registration.
 */

export default async function generate() {
    let routes = [];
    routes.push(new ComparisonRoutes());
    return routes;
}