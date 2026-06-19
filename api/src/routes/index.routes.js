/*!
 * Core.API.Router
 * File: index.routes.js
 * Copyright(c) 2026 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

import express from 'express';
import * as schema from '../services/schema.services.js';
import * as auth from '../services/auth.services.js';
import main from './main.routes.js';
import users from './users.routes.js';
import nodes from './nodes.routes.js';
import models from './model.routes.js';
import metadata from './metadata.routes.js';
import files from './files.routes.js';
import master from './comparison.routes.js';
import other from './other.routes.js';
import maps from './maps.routes.js';
import pool from "../services/db.services.js";

/**
 * Routes initialization. Routes only generated for
 * defined models in the node_types relation.
 */

async function initRoutes(client, routes, baseRouter) {

    // Generate secondary express router
    let router = express.Router({strict: true});

    try {
        let permissions = await schema.getPermissions(client);

        // add API endpoints
        Object.entries(routes.routes).forEach(([view, route]) => {
            router.route(route.path)
                .all(async (req, res, next) => {
                    try {

                        // initialize controller
                        await routes.controller.init(req, res, next)
                            .catch(err => {
                                throw err;
                            });

                        // filter permissions for given view
                        const allowedRoles = permissions
                            .filter(viewPermissions => {
                                return viewPermissions.view === view;
                            })
                            .map(permission => {
                                return permission.role;
                            });

                        // authorize user access based on role permissions
                        // - user data set to null for anonymous users (visitors)
                        req.user = await auth.authorize(req, res, allowedRoles)
                            .catch(err => {
                                throw err;
                            });

                    }
                    catch (err) {
                        return next(err);
                    }
                    next();
                })
                .get(function(req, res, next) {
                    if (!route.get)
                        return next(new Error(`${view} [get] route not implemented.`));
                    route.get(req, res, next);
                })
                .put(function(req, res, next) {
                    if (!route.put)
                        return next(new Error(`${view} [put] route not implemented.`));
                    route.put(req, res, next);
                })
                .post(function(req, res, next) {
                    if (!route.post)
                        return next(new Error(`${view} [post] route not implemented.`));
                    route.post(req, res, next);
                })
                .delete(function(req, res, next) {
                    if (!route.delete)
                        return next(new Error(`${view} [delete] route not implemented.`));
                    route.delete(req, res, next);
                });

            // add secondary router to main router
            baseRouter.use('', router);
        });

    } catch (err) {
        console.error(err)
        throw err;
    }
}

/**
 * Router initialization. Applies secondary routers to base router.
 */

export default async function initRouter() {
    const client = await pool.connect();

    try {
        const baseRouter = express.Router({strict: true});

        // Pass client to sequential routes
        await initRoutes(client, main, baseRouter);
        await initRoutes(client, users, baseRouter);
        await initRoutes(client, nodes, baseRouter);
        await initRoutes(client, other, baseRouter);
        await initRoutes(client, maps, baseRouter);

        // Pass client to parallel blocks safely
        const modelsRoutes = await models(client);
        await Promise.all(modelsRoutes.map(routes => {
            return initRoutes(client, routes, baseRouter)
        }));

        const metadataRoutes = await metadata(client);
        await Promise.all(metadataRoutes.map(routes => {
            return initRoutes(client, routes, baseRouter)
        }));

        const filesRoutes = await files(client);
        await Promise.all(filesRoutes.map(routes => {
            return initRoutes(client, routes, baseRouter)
        }));

        const masterRoutes = await master(client);
        await Promise.all(masterRoutes.map(routes => {
            return initRoutes(client, routes, baseRouter)
        }));

        return baseRouter;
        
    } catch (err) {
        throw err
    }
    finally {
        // Change to false so the pool retains the connection socket!
        client.release(false); 
    }
}
