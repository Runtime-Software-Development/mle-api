/*!
 * Core.API.Router.Other
 * File: other.routes.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

import * as otherController from '../controllers/other.controller.js';

/**
 * Express router
 */

let routes = new OtherRoutes();
export default routes;

/**
 * Constructor for alternate and miscellaneous routes.
 * @class
 * @public
 */
function OtherRoutes() {

    // initialize other controller
    this.controller = otherController;

    // add controller routes
    /**
     * @typedef {Object} Route
     * @property {string} path - The route path.
     * @property {function} get - GET handler.
     * @property {function} [put] - PUT handler. Default is null.
     * @property {function} [post] - POST handler. Default is null.
     * @property {function} [delete] - DELETE handler. Default is null.
     */
    this.routes = {
        /**
         * Showcase route. Returns a list of showcase items.
         * @type {Route}
         */
        filter: {
            path: '/showcase',
            get: this.controller.show,
            put: null,
            post: null,
            delete: null,
        }
    }
}
