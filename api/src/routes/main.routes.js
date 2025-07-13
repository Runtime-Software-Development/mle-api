/*!
 * Core.API.Router.Main
 * File: main.routes.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

import * as main from '../controllers/main.controller.js';

/**
 * Express router
 */

let routes = new MainRoutes();
export default routes;

/**
 * Default routes constructor
 *
 * This constructor adds routes to the main Express router instance.
 * The routes are:
 * - GET / : Returns the main MLE application page.
 * - GET /admin/logs : Returns the jobs log page.
 * - GET /admin/jobs : Returns the jobs list page.
 *
 * @public
 */
function MainRoutes() {

    // initialize model controller
    this.controller = main;

    // add controller routes
    this.routes = {
        /**
         * GET /
         * Returns the main MLE application page.
         *
         * @public
         */
        show: {
            path: '/',
            get: this.controller.show,
            put: null,
            post: null,
            delete: null,
        },

        /**
         * GET /
         * Returns the main MLE application page.
         *
         * @public
         */
        filter: {
            path: '/admin/status',
            get: this.controller.status,
            put: null,
            post: null,
            delete: null,
        },

        /**
         * GET /admin/logs
         * Returns the jobs log page.
         *
         * @public
         */
        raw: {
            path: '/admin/logs',
            get: this.controller.logs,
            put: null,
            post: null,
            delete: null,
        },

        /**
         * GET /admin/jobs
         * Returns the jobs list page.
         *
         * @public
         */
        options: {
            path: '/admin/jobs',
            get: this.controller.jobs,
            put: null,
            post: null,
            delete: null,
        }
    }
}
