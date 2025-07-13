/*!
 * Core.API.Router.Nodes
 * File: nodes.routes.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description:
 * Node data routes.
 */

import * as nodesController from '../controllers/nodes.controller.js';
import path from "path";

let routes = new NodesRoutes();
export default routes;

/**
 * Default nodes routes constructor
 *
 * @public
 */

function NodesRoutes() {

    // initialize node controller
    this.controller = nodesController;

    // add controller routes
    this.routes = {
        filter: {
            path: '/filter',
            get: this.controller.filter,
            put: null,
            post: null,
            delete: null,
        },
        search: {
            path: '/search',
            get: this.controller.search,
            put: null,
            post: null,
            delete: null,
        },
        tree: {
            path: '/nodes/tree',
            get: this.controller.tree,
            put: null,
            post: null,
            delete: null,
        },
        map: {
            path: '/nodes/map',
            get: this.controller.map,
            put: null,
            post: null,
            delete: null,
        },
        show: {
            path: path.join('/nodes/show/:id'),
            get: this.controller.show,
            put: null,
            post: null,
            delete: null,
        },
        export: {
            path: path.join('/nodes/export/:schema/:format'),
            get: this.controller.exporter,
            put: null,
            post: null,
            delete: null,
        },
        remove: {
            path: path.join('/nodes/remove'),
            get: null,
            put: null,
            post: null,
            delete: this.controller.remove,
        },
    }
}
