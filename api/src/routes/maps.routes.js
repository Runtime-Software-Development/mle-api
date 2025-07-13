/*!
 * Core.API.Router.Maps
 * File: maps.routes.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Map data routes.
 *
 * ---------
 * Revisions

 */

/**
 * Module dependencies
 */

import * as controller from '../controllers/maps.controller.js';

/**
 * Map data routes constructor
 * @public
 */

function MapsRoutes() {

    // initialize node controller
    this.controller = controller;

    // add controller routes
    this.routes = {
        create: {
            path: '/files/map/features/:id',
            get: controller.extractMapFeatures,
            put: null,
            post: controller.createMapFeatures,
            delete: null,
        },
        show: {
            path: '/map/features',
            get: this.controller.getMapFeatures,
            put: null,
            post: null,
            delete: null,
        }
    }
}

/**
 * Express router
 */

let maps = new MapsRoutes();
export default maps;


