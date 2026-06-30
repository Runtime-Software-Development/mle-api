/*!
 * MLP.API.App
 * File: app.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description
 * - Main Express application instance for Explorer API.
 * - API routes
 * - Error handlers
 * - CORS
 * - Helmet
 * - Morgan
 * - Cookie parser
 * - Static files
 * 
 * Revisions
 * - 29-07-2023   Refactored out Redis connection as separate queue service.
 * - 08-09-2024   Changed CORS and Helmet settings to allow cross-origin requests.
 */

'use strict';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { globalHandler, notFoundHandler } from './error.js';
import router from './routes/index.routes.js';
import st from 'st';
import { testDatabaseConnection } from './services/db.services.js';
import { startQueueHealthMonitor } from './services/other.services.js';
import { ensureAppDirectories } from './lib/file.utils.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create Express application.
 * @private
 */

export default async () => {

    // Ensure data directories exist before starting the server
    ensureAppDirectories();

    /**
     * Initialize main Express instance.
     */

    const app = express();

    // Define log directory and file name
    const logDirectory = process.env.MLE_LOG_DIR || path.join(__dirname, 'log');
    const logFileName = process.env.MLE_ACCESS_LOG_FILE || 'access.log';
    const errorLogFileName = process.env.MLE_ERROR_LOG_FILE || 'error.log';

    fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory, { recursive: true });

    // Create access and error log streams
    const accessLogStream = createStream(logFileName, {
        interval: '7d',
        path: logDirectory,
        compress: 'gzip',
        maxFiles: 10,
        size: '10M'
    });
    const errorLogStream = createStream(errorLogFileName, {
        interval: '7d',
        path: logDirectory,
        compress: 'gzip',
        maxFiles: 10,
        size: '10M'
    });

    // Error Logger Function
    // This function will write errors to both console.error and the error log file
    const errorLogger = {
        error: (message, error = null) => {
            const timestamp = new Date().toISOString();
            let logMessage = `[${timestamp}] ERROR: ${message}`;
            if (error) {
                if (error instanceof Error) {
                    logMessage += `\nStack: ${error.stack}`;
                } else if (typeof error === 'object') {
                    logMessage += `\nDetails: ${JSON.stringify(error)}`;
                } else {
                    logMessage += `\nDetails: ${error}`;
                }
            }

            // Write to console.error (for immediate visibility during dev/debugging)
            console.error(logMessage);

            // Write to the error log file
            errorLogStream.write(logMessage + '\n');
        }
    };

    console.log('MLE API URL: %s', process.env.MLE_API_BASEURL);

    // Test the database connection
    await testDatabaseConnection();

    // Test the queue API health
    startQueueHealthMonitor()

    // set allowed origins
    const allowedOrigins = [
        process.env.MLE_API_BASEURL,
        process.env.MLE_APP_BASEURL,
        process.env.MLE_QUEUE_SERVER_URL || `${process.env.MLE_QUEUE_HOST}:${process.env.MLE_QUEUE_PORT}`,
        process.env.MLE_KC_SERVER_URL
    ];
    // console.log(`Allowed origins: \n\t${allowedOrigins.join('\n\t')}`);

    /**
     * Express Security Middleware
     *
     * Hide Express usage information from public.
     * Use Helmet for security HTTP headers
     * - Strict-Transport-Security enforces secure (HTTP over SSL/TLS)
     *   connections to the server
     * - X-Frame-Options provides clickjacking protection
     * - X-XSS-Protection enables the Cross-site scripting (XSS)
     *   filter built into most recent web browsers
     * - X-Content-Type-Options prevents browsers from MIME-sniffing
     *   a response away from the declared _static-type
     *   Content-Security-Policy prevents a wide range of attacks,
     *   including Cross-site scripting and other cross-site injections
     *
     *   Online checker: http://cyh.herokuapp.com/cyh.
     */

    app.disable('x-powered-by');
    app.use(helmet.contentSecurityPolicy({
        directives: {
            frameSrc: ["'self'", ...allowedOrigins],
        },
    }));
    app.use(helmet({
        crossOriginResourcePolicy: false,
        dnsPrefetchControl: false,
        expectCt: false,
        featurePolicy: false,
        frameguard: false,
        hidePoweredBy: false,
        hsts: false,
        ieNoOpen: false,
        noSniff: false,
        originAgentCluster: false,
        referrerPolicy: false,
        xssFilter: false,
    }));

    /**
     * Set proxy and cross-origin settings (CORS).
     */

    app.set('trust proxy', 1); // trust first proxy

    // enable CORS
    app.use(cors({
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'DELETE'],
        preflightContinue: false,
        optionsSuccessStatus: 200,
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400, // 24 hours
    }));

    // use morgan for HTTP request logging
    app.use(morgan(process.env.MLE_LOG_FORMAT || 'dev'));
    app.use(morgan(process.env.MLE_LOG_FORMAT || 'combined', { stream: accessLogStream }));

    // parse application/x-www-form-urlencoded
    app.use(express.urlencoded({
        extended: true
    }));

    // parse application/json
    app.use(express.json({
        extended: true
    }));

    // set cookie secret
    app.use(cookieParser(
        process.env.MLE_COOKIE_SECRET
    ));

    // set Access-Control-Allow-Origin
    app.use(function (_, res, next) {
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header(
            'Access-Control-Allow-Headers',
            'Origin, X-Requested-With, Content-Type, Accept'
        );
        next();
    });

    /**
     * Reroute favicon icon request.
     */
    app.get('/favicon.ico', (_, res) => res.status(204).send());

    /**
     * Serve static files.
     */

    const mount = st({ path: process.env.MLE_LOWRES_DIR, url: '/uploads' })
    app.use(mount);

    /**
     * Initialize router asynchronously.
     */

    app.use('/', await router());



    /**
     * Set default global error handlers.
     */

    app.use(globalHandler);
    app.use(notFoundHandler);

    return app;
}
