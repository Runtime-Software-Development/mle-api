/*!
 * MLP.API.Services.Queue
 * File: queue.services.js
 * Copyright(c) 2023 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * ----------
 * Description
 *
 * Queue API service implementation for Redis backend.
 *
 * ---------
 * Revisions
 * - 29-07-2023   Created new queue service.
 */

'use strict';

import dotenv from 'dotenv';
import Queue from "bull";
import redis from "redis";
import fetch from 'node-fetch';
dotenv.config();


/**
 * Asynchronous function to check if the queue server is ready.
 * @returns {Promise<boolean>} a promise that resolves to true if the queue server is ready, false otherwise
 */
async function isQueueServerReady() {
  try {
    // construct the URL to the server
    const url = `${process.env.MLE_QUEUE_HOST}:${process.env.MLE_QUEUE_PORT}/`;
    // make a request to the server and wait for the response
    const response = await fetch(url);
    // if the response is OK, the server is ready
    return response.ok;
  } catch (error) {
    // if there is an error, the server is not ready
    return false;
  }
}

/**
 * Connect to Redis message broker
 * - allows files to be queued for processing
 * @private
 */

const queueName = 'file_processor';

let queue = new Queue(queueName, {
    redis: {
        host: process.env.MLE_REDIS_HOST,
        port: process.env.MLE_REDIS_PORT,
    },
});

// test Redis connection
const client = redis.createClient({
    redis: {
        host: process.env.MLE_REDIS_HOST,
        port: process.env.MLE_REDIS_PORT,
    },
});

// handle Redis connection error
client.on('error', error => {
    console.error('ERROR initialising Redis connection', error.message);
});

// test Redis connection.
client.on('connect', async () => {
    console.log(
        `Connected to Redis: ${client}`,
    );
    // console.log(`Queue API: ${await ready() ? 'Ready' : 'Not Ready'}`);
});

/**
 * Retrieves all jobs from a Redis queue.
 *
 * @async
 * @return {Promise<void>} - Resolves when finished.
 * @throws {Error} - If queue is not available.
 */
export const getQueueJobs = async () => {
    try {
        const res = await queue.getJobs(null, 0, 1000, true);
        return {
            status: {
                server: await isQueueServerReady(),
                redis: await queue.client.ping() === 'PONG'
            },
            counts: await queue.getJobCounts(['active', 'completed', 'delayed', 'failed', 'waiting']),
            data: await Promise.all((res || []).map(async (job) => {
                const state = await job.getState();
                return {
                    jobId: job.id,
                    data: JSON.stringify(job.data),
                    finishedOn: job.finishedOn,
                    processedOn: job.processedOn,
                    status: state,
                    timestamp: job.timestamp,
                    error: (job.stacktrace || job.failedReason) ? JSON.stringify(job.stacktrace || job.failedReason) : null
                };
            }))
        };

    } catch (err) {
        console.error(err);
        throw new Error('queueUnavailable');
    }
};

/**
 * Fetches job details from Redis
 *
 * @param {string} jobId - The ID of the job to fetch
 * @returns {Promise<Object|null>} - The job details as an object, or null if the job is not found
 */
async function getJobDetails(jobId) {
    try {
        // Fetch the job details from Redis (assuming jobs are stored in a list or similar)
        // We use the lPop method to retrieve the job data from the list, and then parse it as JSON
        const jobData = await redisClient.lPop(`job_queue_${jobId}`);
        if (jobData) {
            return JSON.parse(jobData);
        } else {
            console.log('Job not found in Redis');
            return null;
        }
    } catch (error) {
        // If there is an error, log it and return null
        console.error('Error fetching job details from Redis:', error);
        return null;
    }
}

/**
     * Retry a job with the given ID.
     *
     * @param {string} jobId - The ID of the job to retry.
     * @returns {Promise<void>} - Resolves when the job has been retried.
     */
const retryJob = async (jobId) => {
    // Display date for retry
    const display_format_options = { year: 'numeric', month: 'short', day: 'numeric' };
    const date_object = new Date(Date.now());
    const date_display = date_object.toLocaleDateString("en-US", display_format_options); // provide in specified format
    const time_display = date_object.toLocaleTimeString("en-US", {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: "America/Chicago",
        timeZoneName: 'short'
    });
    const datetime_display = `${date_display} | ${time_display.slice(0, -4)}`;

    // Fetch job by ID
    const job = await queue.getJob(jobId);

    // Update job to include retried datetime
    await job.update({ ...job.data, "retried": datetime_display });

    // Retry job
    await job.retry();
}

export default queue;