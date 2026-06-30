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

    // return captures with metadata
    return await Promise.all(
        (showcaseCaptures || []).map(async (capture) => {
            const { id = null, type=null } = capture || {};
            return await nserve.get(id, type, client);
        }));
};



/** * Get detailed queue status including job counts and raw job data.
 * - Fetches the status of the queue, including job counts and details.
 * - Returns a structured response with server readiness, Redis connectivity,
 *   job counts, and job details.
 * @public
 * @param client
 * @return {Promise} result
 */

const HEALTH_CHECK_INTERVAL_MS = 30000; // Check every 15 seconds
let queueApiStatus = 'unknown'; // Initial status

const getQueueServerUrl = () => {
    if (!process.env.MLE_QUEUE_SERVER_URL) {
        return '';
    }
    try {
        return new URL(process.env.MLE_QUEUE_SERVER_URL).origin;
    } catch (err) {
        console.warn('[API] Invalid MLE_QUEUE_SERVER_URL:', process.env.MLE_QUEUE_SERVER_URL);
        return process.env.MLE_QUEUE_SERVER_URL.replace(/\/+$/, '');
    }
};

export async function checkQueueApiHealth() {
    const queueHealthUrl = `${getQueueServerUrl()}/health`;
    console.log(`[Health Check] Pinging mle-queue API at ${queueHealthUrl}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

        const response = await fetch(queueHealthUrl, { signal: controller.signal });

        clearTimeout(timeoutId); // Clear the timeout if the request completes in time

        if (response.ok) { // response.ok is true for 2xx status codes
            console.log(`[Health Check] mle-queue API is HEALTHY (Status: ${response.status})`);
            return 'healthy';
        } else {
            // For non-2xx responses, fetch doesn't throw, so we handle it here
            const errorText = await response.text(); // Or .json() if expecting JSON error
            console.warn(`[Health Check] mle-queue API returned non-200 status: ${response.status}. Response: ${errorText}`);
            return 'unhealthy';
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Health Check] Timeout connecting to mle-queue API: ${error.message}`);
        } else {
            console.error(`[Health Check] Network error connecting to mle-queue API: ${error.message}`);
        }
        return 'unreachable';
    }
}

// Start the periodic health check when your API server starts
export function startQueueHealthMonitor() {
    console.log(`[Health Check] Starting periodic health check for mle-queue API every ${HEALTH_CHECK_INTERVAL_MS / 1000} seconds.`);
    setInterval(checkQueueApiHealth, HEALTH_CHECK_INTERVAL_MS);
    // Run an initial check immediately
    checkQueueApiHealth();
}



