/*!
 * MLP.API.Services.Other
 * File: other.services.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import queries from '../queries/index.queries.js';
import * as nserve from "./nodes.services.js";
import fetch from 'node-fetch';
import AbortController from "abort-controller";

/**
 * Get showcase images for frontpage image carousel.
 * - queries special 'showcase' project for encoded unsorted captures
 *   used in image carousel
 *
 * @public
 * @param client
 * @return {Promise} result
 */

export const getShowcaseCaptures = async (client) => {
    let { sql, data } = queries.other.showcase();
    let node = await client.query(sql, data);

    // query 'showcase' project for unsorted captures
    const showcaseCaptures = node.hasOwnProperty('rows') && node.rows.length > 0
        ? node.rows
        : null;

    // return captures with metadata sequentially to avoid overlapping client queries
    const capturesWithMetadata = [];
    for (const capture of (showcaseCaptures || [])) {
        const { id = null, type = null } = capture || {};
        capturesWithMetadata.push(await nserve.get(id, type, client));
    }
    return capturesWithMetadata;
};



/** * Get detailed queue status including job counts and raw job data.
 * - Fetches the status of the queue, including job counts and details.
 * - Returns a structured response with server readiness, Redis connectivity,
 *   job counts, and job details.
 * @public
 * @param client
 * @return {Promise} result
 */

const HEALTH_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
let queueApiStatus = 'unknown'; // Last observed status

// Only log when the status changes, so a healthy queue doesn't flood the logs.
function recordQueueApiStatus(status, logFn, message) {
    if (status !== queueApiStatus) {
        logFn(message);
        queueApiStatus = status;
    }
    return status;
}

export async function checkQueueApiHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

        const response = await fetch(`${process.env.MLE_QUEUE_SERVER_URL}/health`, { signal: controller.signal });

        clearTimeout(timeoutId); // Clear the timeout if the request completes in time

        if (response.ok) { // response.ok is true for 2xx status codes
            return recordQueueApiStatus('healthy', console.log,
                `[Health Check] mle-queue API is HEALTHY (Status: ${response.status})`);
        } else {
            // For non-2xx responses, fetch doesn't throw, so we handle it here
            const errorText = await response.text(); // Or .json() if expecting JSON error
            return recordQueueApiStatus('unhealthy', console.warn,
                `[Health Check] mle-queue API returned non-200 status: ${response.status}. Response: ${errorText}`);
        }
    } catch (error) {
        const reason = error.name === 'AbortError' ? 'Timeout' : 'Network error';
        return recordQueueApiStatus('unreachable', console.error,
            `[Health Check] ${reason} connecting to mle-queue API at ${process.env.MLE_QUEUE_SERVER_URL}/health: ${error.message}`);
    }
}

// Start the periodic health check when your API server starts
export function startQueueHealthMonitor() {
    console.log(`[Health Check] Starting periodic health check for mle-queue API every ${HEALTH_CHECK_INTERVAL_MS / 1000} seconds.`);
    setInterval(checkQueueApiHealth, HEALTH_CHECK_INTERVAL_MS);
    // Run an initial check immediately
    checkQueueApiHealth();
}



