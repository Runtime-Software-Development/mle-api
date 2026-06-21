/*!
 * MLP.API.Controllers.Other
 * File: other.controller.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

import { prepare } from '../lib/api.utils.js';
import { getShowcaseCaptures } from '../services/other.services.js';
import pool from '../services/db.services.js';
import AbortController from "abort-controller";
import fetch from 'node-fetch';

/**
 * Controller initialization.
 *
 * @src public
 */

export const init = async () => {
};

/**
 * Request showcase capture data (frontpage image carousel)
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const show = async (req, res, next) => {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    // retrieve captures attached to 'showcase' project
    try {
        const showcaseImages = await getShowcaseCaptures(client) || [];
        res.status(200).json(
            prepare({
                view: 'showcase',
                data: showcaseImages
            }));
    } catch (err) {
        return next(err);
    }
    finally {
        client.release();
    }
};

/**
 * Download file directly.
 *
 * @param req
 * @param res
 * @param next
 * @src public
 */

export const download = async (req, res, next) => {
    // NOTE: client undefined if connection fails.
    const client = await pool.connect();

    // retrieve captures attached to 'showcase' project
    try {
        const showcaseImages = await getShowcaseCaptures(client) || [];
        res.status(200).json(
            prepare({
                view: 'showcase',
                data: showcaseImages
            }));
    } catch (err) {
        return next(err);
    }
    finally {
        client.release();
    }
};


/**
 * Retry a job with the given ID.
 *
 * @param {Object} req - Request object from Express.js
 * @param {Object} res - Response object from Express.js
 * @param {Function} next - Next middleware function
 * @src public
 */
export const retryJob = async (req, res, next) => {

    console.log(`[Admin] Attempting to retry job ID: ${req.params.id} via Queue API.`);
    const jobId = req.params.id;
    const QUEUE_API_URL = process.env.MLE_QUEUE_SERVER_URL || 'http://mle-queue:3002';
    const RETRY_ENDPOINT = `/jobs/retry/${jobId}`; // Endpoint on the queue API
    const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout for the retry request

    if (!jobId) {
        return res.status(400).json({
            success: false,
            message: 'Job ID is required to retry a job.'
        });
    }

    console.log(`[Admin] Attempting to retry job ID: ${jobId} via Queue API.`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(`${QUEUE_API_URL}${RETRY_ENDPOINT}`, {
            method: 'POST', // Typically a POST request for an action
            headers: {
                'Content-Type': 'application/json',
                // Add any necessary internal API keys or authentication headers here
                // if your queue API requires them for internal calls.
                // e.g., 'X-Internal-API-Key': process.env.QUEUE_INTERNAL_API_KEY
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            console.log(`[Admin] Job retry request for ID ${jobId} successfully sent to Queue API.`, result);
            return res.status(200).json({
                success: true,
                message: `Job ID ${jobId} retry request submitted to queue.`,
                data: result
            });
        } else {
            const errorBody = await response.text();
            console.error(`[Admin] Queue API returned non-2xx status for job ID ${jobId}: ${response.status} - ${errorBody}`);
            return res.status(response.status).json({
                success: false,
                message: `Failed to retry job ID ${jobId} on queue API. Status: ${response.status}`,
                details: errorBody
            });
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Admin] Timeout when trying to retry job ID ${jobId} with Queue API: ${error.message}`);
            return res.status(504).json({ // 504 Gateway Timeout
                success: false,
                message: `Queue API did not respond in time for job ID ${jobId}.`,
                details: error.message
            });
        } else {
            console.error(`[Admin] Network error when trying to retry job ID ${jobId} with Queue API: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: `Failed to connect to queue API for job ID ${jobId}.`,
                details: error.message
            });
        }
    }
};

/**
 * Delete a job with the given ID from the Bull queue via Queue API.
 *
 * @param {Object} req - Request object from Express.js
 * @param {Object} res - Response object from Express.js
 * @param {Function} next - Next middleware function
 * @src public
 */
export const removeJob = async (req, res, next) => {
    console.log(`[Admin] Attempting to delete job ID: ${req.params.id} via Queue API.`);
    const jobId = req.params.id;
    const QUEUE_API_URL = process.env.MLE_QUEUE_SERVER_URL || 'http://mle-queue:3002';
    const DELETE_ENDPOINT = `/jobs/delete/${jobId}`;
    const FETCH_TIMEOUT_MS = 10000;

    if (!jobId) {
        return res.status(400).json({
            success: false,
            message: 'Job ID is required to delete a job.'
        });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(`${QUEUE_API_URL}${DELETE_ENDPOINT}`, {
            method: 'DELETE', // DELETE request for deleting a job
            headers: {
                'Content-Type': 'application/json',
                // Add internal API keys or authentication headers if required
                // 'X-Internal-API-Key': process.env.QUEUE_INTERNAL_API_KEY
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            console.log(`[Admin] Job delete request for ID ${jobId} successfully sent to Queue API.`, result);
            return res.status(200).json({
                success: true,
                message: `Job ID ${jobId} delete request submitted to queue.`,
                data: result
            });
        } else {
            const errorBody = await response.text();
            console.error(`[Admin] Queue API returned non-2xx status for job ID ${jobId}: ${response.status} - ${errorBody}`);
            return res.status(response.status).json({
                success: false,
                message: `Failed to delete job ID ${jobId} on queue API. Status: ${response.status}`,
                details: errorBody
            });
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Admin] Timeout when trying to delete job ID ${jobId} with Queue API: ${error.message}`);
            return res.status(504).json({
                success: false,
                message: `Queue API did not respond in time for job ID ${jobId}.`,
                details: error.message
            });
        } else {
            console.error(`[Admin] Network error when trying to delete job ID ${jobId} with Queue API: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: `Failed to connect to queue API for job ID ${jobId}.`,
                details: error.message
            });
        }
    }
};