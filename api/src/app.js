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
 * - 08-09-2024   Added error logging to file and console.
 * - 27-06-2026   Added directory creation for log and uploads directories.
 * - 27-06-2026   Added database connection test on startup.
 * - 27-06-2026   Added queue health monitor on startup.
 * - 27-06-2026   Updated Node.js version to 24.
 * 
 */

'use strict';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { globalHandler, notFoundHandler } from './error.js';
import router from './routes/index.routes.js';
import { testDatabaseConnection } from './services/db.services.js';
import { startQueueHealthMonitor } from './services/other.services.js';
import { ensureAppDirectories } from './lib/file.utils.js';
import { configureConsoleLogging, shouldEnableHttpAccessLogs } from './lib/logging.utils.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatCLFLocalDate(date = new Date()) {
    const day = pad2(date.getDate());
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const hour = pad2(date.getHours());
    const minute = pad2(date.getMinutes());
    const second = pad2(date.getSeconds());

    const tzOffsetMinutes = date.getTimezoneOffset();
    const sign = tzOffsetMinutes > 0 ? '-' : '+';
    const absOffset = Math.abs(tzOffsetMinutes);
    const tzHours = pad2(Math.floor(absOffset / 60));
    const tzMinutes = pad2(absOffset % 60);

    return `${day}/${month}/${year}:${hour}:${minute}:${second} ${sign}${tzHours}${tzMinutes}`;
}

/**
 * Create Express application.
 * @private
 */

export default async () => {

    const activeLogLevel = configureConsoleLogging();

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
    const fileLoggingEnabled = String(process.env.MLE_LOG_TO_FILE || 'true').toLowerCase() === 'true';

    let accessLogStream = null;
    let errorLogStream = null;

    if (fileLoggingEnabled) {
        fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory, { recursive: true });

        // Create access and error log streams
        accessLogStream = createStream(logFileName, {
            interval: '7d',
            path: logDirectory,
            compress: 'gzip',
            maxFiles: 10,
            size: '10M'
        });
        errorLogStream = createStream(errorLogFileName, {
            interval: '7d',
            path: logDirectory,
            compress: 'gzip',
            maxFiles: 10,
            size: '10M'
        });
    } else {
        console.log('[Logging] File logging disabled (MLE_LOG_TO_FILE=false); using stdout/stderr only.');
    }

    // Guard against transient filesystem/NFS failures (for example, ESHUTDOWN on network volumes).
    // Without an error listener, stream "error" events can terminate the process.
    let accessLogStreamHealthy = true;
    let errorLogStreamHealthy = true;

    if (accessLogStream) {
        accessLogStream.on('error', (err) => {
            accessLogStreamHealthy = false;
            console.error('[Logging] Access log stream disabled due to write error:', err?.message || err);
        });
    }

    if (errorLogStream) {
        errorLogStream.on('error', (err) => {
            errorLogStreamHealthy = false;
            console.error('[Logging] Error log stream disabled due to write error:', err?.message || err);
        });
    }

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
            if (errorLogStreamHealthy && errorLogStream) {
                try {
                    errorLogStream.write(logMessage + '\n');
                } catch (streamError) {
                    errorLogStreamHealthy = false;
                    console.error('[Logging] Failed to write error log entry:', streamError?.message || streamError);
                }
            }
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
        `${process.env.MLE_QUEUE_HOST}:${process.env.MLE_QUEUE_PORT}`,
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
    morgan.token('localdate', (_, __, ___, date) => formatCLFLocalDate(date));
    morgan.format('combined-local', ':remote-addr - :remote-user [:localdate] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"');

    const consoleLogFormat = process.env.MLE_LOG_FORMAT || 'dev';
    const accessLogFormat = process.env.MLE_LOG_FORMAT || 'combined';
    const httpAccessLogsEnabled = shouldEnableHttpAccessLogs(activeLogLevel);

    if (httpAccessLogsEnabled) {
        app.use(morgan(consoleLogFormat === 'combined' ? 'combined-local' : consoleLogFormat));
    }
    const morganAccessStream = {
        write: (line) => {
            if (!accessLogStreamHealthy || !accessLogStream) {
                process.stdout.write(line);
                return;
            }

            try {
                accessLogStream.write(line);
            } catch (streamError) {
                accessLogStreamHealthy = false;
                console.error('[Logging] Failed to write access log entry:', streamError?.message || streamError);
                process.stdout.write(line);
            }
        }
    };

    if (httpAccessLogsEnabled) {
        app.use(morgan(accessLogFormat === 'combined' ? 'combined-local' : accessLogFormat, { stream: morganAccessStream }));
    } else {
        console.warn('[Logging] HTTP access logging disabled for current LOG_LEVEL.');
    }

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
    app.get('/healthz', (_, res) => {
        res.status(200).json({ status: 'ok', server: 'up' });
    });

    app.get('/favicon.ico', (_, res) => res.status(204).send());

    /**
     * Serve static files.
     */

    const uploadsDir = process.env.MLE_LOWRES_DIR;
    if (uploadsDir) {
        app.use('/uploads', express.static(uploadsDir, {
            dotfiles: 'deny',
            fallthrough: false,
            index: false,
            maxAge: '1d',
        }));
    } else {
        console.warn('MLE_LOWRES_DIR is not set; /uploads static files will not be served.');
    }

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
