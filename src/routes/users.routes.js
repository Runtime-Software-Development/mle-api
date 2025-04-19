/*!
 * Core.API.Router.Users
 * File: users.routes.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description
 * User data routes.
 */

import * as auth from '../controllers/auth.controller.js'
import path from 'path';

/**
 * Users routes
 * @public
 */

let routes = new UserRoutes();
export default routes;

/**
 * Model user routes constructor
 *
 * @public
 */

function UserRoutes() {

    // create model identifier key
    this.model = 'users';
    this.key = 'user_id';

    // initialize model controller
    this.controller = auth;

    // add controller routes
    this.routes = {
        login: {
            path: path.join('/login'),
            get: null,
            put: null,
            post: this.controller.login,
            delete: null,
        },
        logout: {
            path: path.join('/logout'),
            get: null,
            put: null,
            post: this.controller.logout,
            delete: null,
        },
        refresh: {
            path: path.join('/refresh'),
            get: null,
            put: null,
            post: this.controller.refresh,
            delete: null,
        }
    }
}
