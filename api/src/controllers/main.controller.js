/*!
 * MLP.API.Controllers.Main
 * File: main.controller.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Controller for general MLE analytics and status.
 *
 * ---------
 * Revisions
 * - [25-08-2024] Updated image file queue jobs status.
 */

import { prepare } from '../lib/api.utils.js';
import { getMetadataOptions } from '../services/metadata.services.js';
import pool from '../services/db.services.js';
import fs from "fs";
import path from 'path';
import fetch from 'node-fetch';
import { checkDatabaseHealth } from '../services/db.services.js';
import { checkQueueApiHealth } from '../services/other.services.js';
import { checkKeycloakHealth } from '../services/auth.services.js';

/**
 * Controller initialization.
 *
 * @src public
 */

export const init = async () => {
};

/**
 * Default request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const show = async (_, res, next) => {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    try {
        res.status(200).json(
            prepare({
                view: 'dashboard',
                options: await getMetadataOptions(client)
            }));
    } catch (err) {
        return next(err);
    }
    finally {
        client.release();
    }
};

/**
 * Controller function to return the health status of various services.
 * @param {object} _ - The request object (unused).
 * @param {object} res - The response object.
 * @param {function} next - The next middleware function.
 */
export const status = async (_, res, next) => {
    try {
        const healthStatus = {};

        // Run all health checks concurrently
        const [dbStatus, queueStatus, keycloakStatus] = await Promise.all([
            checkDatabaseHealth(),
            checkQueueApiHealth(),
            checkKeycloakHealth()
        ]);

        healthStatus.database = dbStatus;
        healthStatus.queueApi = queueStatus;
        healthStatus.keycloak = keycloakStatus;

        // Transform results into the systemStatus format expected by React component
        const systemStatus = {
            server: { status: true }, // If this API endpoint is reachable, the server is "Online"
            database: { status: dbStatus === 'healthy' },
            queue: { status: queueStatus === 'healthy' },
            idp: { status: keycloakStatus === 'healthy' },
            overall: {
                status: dbStatus === 'healthy' && queueStatus === 'healthy' && keycloakStatus === 'healthy'
            }
        };

        // Log the health check results
        res.status(200).json(
            prepare({
                view: 'dashboard',
                data: systemStatus,
            })
        );

    } catch (err) {
        // Catch any unexpected errors during the status check itself
        console.error('[Health Check] Unexpected error during status check:', err);
        next(err); // Pass error to Express error handler
    }
};

/**
 * Administrative analytics and logs request controller.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const logs = async (_, res, next) => {
    try {
        const logDir = path.join(process.env.MLE_LOG_DIR || './logs');
        const apiRequiredFiles = ['error.log', 'access.log'];

        const readLocalLogFile = async (fileName) => {
            const filePath = path.join(logDir, fileName);
            try {
                const data = await fs.promises.readFile(filePath, 'utf8');
                return {
                    source: 'api',
                    file: fileName,
                    contents: data.split('\n')
                };
            } catch (error) {
                return {
                    source: 'api',
                    file: fileName,
                    contents: [],
                    missing: true,
                    details: error?.message || 'Log file not available'
                };
            }
        };

        const apiLogs = await Promise.all(apiRequiredFiles.map(readLocalLogFile));

        let queueLogs = [];
        if (process.env.MLE_QUEUE_SERVER_URL) {
            const queueLogsUrl = `${process.env.MLE_QUEUE_SERVER_URL}/queue/logs`;
            try {
                const response = await fetch(queueLogsUrl);
                if (response.ok) {
                    const payload = await response.json();
                    queueLogs = Array.isArray(payload?.data) ? payload.data : [];
                } else {
                    queueLogs = [{
                        source: 'queue',
                        file: 'queue-log-fetch-error',
                        contents: [],
                        missing: true,
                        details: `Queue logs endpoint returned ${response.status}`
                    }];
                }
            } catch (queueError) {
                queueLogs = [{
                    source: 'queue',
                    file: 'queue-log-fetch-error',
                    contents: [],
                    missing: true,
                    details: queueError?.message || 'Queue logs endpoint unavailable'
                }];
            }
        } else {
            queueLogs = [{
                source: 'queue',
                file: 'queue-log-fetch-error',
                contents: [],
                missing: true,
                details: 'MLE_QUEUE_SERVER_URL is not configured'
            }];
        }

        const logContents = [...apiLogs, ...queueLogs];

        return res.status(200).json(
            prepare({
                view: 'logs',
                data: logContents,
            })
        );
    } catch (err) {
        return next(err);
    }
};


/**
 * Administrative queued jobs request controller.
 * Returns a list of Redis queue items by calling the Queue Application's status endpoint.
 *
 * @param {Object} _
 * @param {Object} res
 * @param {Function} next
 * @src public
 */
export const jobs = async (_, res, next) => {
    // Construct the full URL to the queue status endpoint
    const queueStatusUrl = `${process.env.MLE_QUEUE_SERVER_URL}/queue/status`;

    try {
        if (!process.env.MLE_QUEUE_SERVER_URL) {
            console.error("MLE_QUEUE_SERVER_URL environment variable is not set in API.");
            return next(new Error("Queue application host not configured."));
        }

        console.log(`[API Controller] Fetching queue status from: ${queueStatusUrl}`);

        const response = await fetch(queueStatusUrl);

        if (!response.ok) {
            const errorBody = await response.text(); // Get raw error message from queue app
            console.error(`[API Controller] Failed to fetch queue status: ${response.status} - ${errorBody}`);
            // Throw an error that will be caught by the outer try-catch and passed to 'next'
            throw new Error(`Queue Application returned non-OK status: ${response.status} - ${errorBody}`);
        }

        const { data, counts, status } = await response.json();

        res.status(200).json(
            prepare({
                view: 'dashboard',
                data: {
                    jobs: data || [],
                    counts: counts || {},
                    status: status,
                },
            })
        );
    } catch (err) {
        console.error(`[API Controller] Error in jobs controller:`, err.message);
        return next(err);
    }
};
