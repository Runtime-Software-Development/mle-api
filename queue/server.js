/**
 * @file server.js
 * @description Initializes and manages a Bull queue for processing background jobs.
 * Provides an Express.js API for receiving jobs and status/health checks.
 * @version 3.0.0
 * @license MIT
 * @copyright (c) 2025 Runtime Software Development Inc.
 */

import express from 'express';
import Bull from 'bull'; // Note: Bull is an older library, TODO: Switch to BullMQ
import { processJob } from './src/worker.js';
import dotenv from 'dotenv';
import { ensureAppDirectories } from './src/utils.js'; 

dotenv.config();

const app = express();
app.use(express.json());

const redisHost = process.env.MLE_REDIS_HOST || 'redis';
const redisPort = parseInt(process.env.MLE_REDIS_PORT || '6379', 10);
const queueName = process.env.MLE_QUEUE_NAME || 'mle-queue';
const concurrentJobs = process.env.MLE_QUEUE_CONCURRENCY ? parseInt(process.env.MLE_QUEUE_CONCURRENCY, 10) : 1;
const appPort = parseInt(process.env.MLE_QUEUE_PORT || '3002', 10);
const appHost = process.env.MLE_QUEUE_HOST || '0.0.0.0';

// Message to console to start the server
console.log('* Mountain Legacy Project');
console.log('* Explorer Application Queue API');
console.log('* Version: 3.0. MIT License');
console.log('* University of Victoria (c) 2025');
console.log('Starting MLE Queue API server...');

// Ensure all specified application directories exist
ensureAppDirectories();

// Initialize the Bull queue
// Ensure robust Redis connection settings for Bull
const queue = new Bull(queueName, {
    redis: {
        host: redisHost,
        port: redisPort,
        // family: 4, // IPv4 (optional)
        // password: process.env.REDIS_PASSWORD, // Add if your Redis requires authentication
        maxRetriesPerRequest: null, // Disable ioredis's per-request retries; rely on connection state
        enableOfflineQueue: true, // Queue commands when offline, process when reconnected
        connectTimeout: 20000, // 20 seconds to establish connection
    },
    limiter: {
        max: concurrentJobs,
        duration: 1000, // Process at most 'max' jobs per 'duration' in milliseconds
    },
});

// --- Bull Queue Connection Event Handling ---
queue.on('ready', () => {
    console.log(` - [INFO] Bull queue '${queueName}' is ready and connected to Redis at ${redisHost}:${redisPort}`);
});

queue.on('error', (error) => {
    console.error(` - [ERROR] Bull queue '${queueName}' encountered an error:`, error);
});

queue.on('active', (job) => {
    console.log(` - [ACTIVE] JOB ${job.id} started processing.`);
});

queue.on('completed', (job) => {
    console.log(` - [COMPLETED] JOB ${job.id}`);
    job.remove().catch(err => console.error(` - [ERROR] Failed to remove job ${job.id}:`, err)); 
});

queue.on('failed', (job, err) => {
    console.error(` - [FAILED] JOB ${job.id} failed with error:`, err.message);
    if (job.attemptsMade < job.opts.attempts) {
        console.log(` - [RETRY] JOB ${job.id} will be retried (attempt ${job.attemptsMade} of ${job.opts.attempts})`);
    } else {
        console.error(` - [FATAL] JOB ${job.id} exhausted retries.`);
    }
});

queue.on('stalled', (job) => {
    console.warn(` - [STALLED] JOB ${job.id} has stalled. It will be retried.`);
});

queue.on('cleaned', (jobs, type) => {
    console.log(` - [CLEANED] Removed ${jobs.length} '${type}' jobs from the queue.`);
});

console.log(` - [INFO] Queue ${queueName} configured with Redis server at ${redisHost}:${redisPort}, concurrency: ${concurrentJobs}`);

// --- API Endpoints ---

// Endpoint for mlpapi to add jobs
app.post('/jobs/process', async (req, res) => {
    try {
        const jobData = req.body;
        if (!jobData || !jobData.file || !jobData.owner) {
            return res.status(400).json({ success: false, message: 'Invalid job data provided. Missing file or owner information.' });
        }

        // Add job to the Bull queue
        const job = await queue.add(jobData, {
            attempts: 3, // Retry up to 3 times on failure
            backoff: {
                type: 'exponential',
                delay: 1000, // 1s, 2s, 4s delays between retries
            },
            // Optionally, add a timeout for the job itself
            // timeout: 600000, // 10 minutes (in ms) before job is considered timed out
        });

        console.log(`[RECEIVED] Job request, added to queue with ID: ${job.id}`);
        res.status(202).json({
            success: true,
            message: 'Job accepted and queued for processing',
            jobId: job.id,
            queueName: queue.name,
        });

    } catch (error) {
        console.error(' - [ERROR] Failed to add job to queue:', error);
        res.status(500).json({ success: false, message: 'Failed to queue job', details: error.message });
    }
});

/**
 * Endpoint to retry a specific failed queue job by its ID.
 * Uses a POST request as this is a state-changing action.
 */
app.post('/jobs/retry/:id', async (req, res) => {
    console.log(`[RETRY] Attempting to retry job ID: ${req.params.id}`);
    const jobId = req.params.id;

    if (!jobId) {
        return res.status(400).json({
            success: false,
            message: 'Job ID is required to retry a job.'
        });
    }

    try {
        const job = await queue.getJob(jobId);

        if (!job) {
            console.warn(`[RETRY] Job ID ${jobId} not found in queue.`);
            return res.status(404).json({
                success: false,
                message: `Job ID ${jobId} not found.`
            });
        }

        const jobState = await job.getState();
        console.log(`[RETRY] Attempting to retry job ID ${jobId}. Current state: ${jobState}`);

        // Only retry if the job is in a 'failed' state.
        // You might extend this to include 'stalled' or 'completed' if you have specific needs.
        if (jobState === 'failed') {
            await job.retry(); // Bull's built-in method to retry a job
            console.log(`[RETRY] Job ID ${jobId} successfully retried.`);

            return res.status(200).json({
                success: true,
                message: `Job ID ${jobId} has been submitted for retry.`,
                jobId: job.id,
                newState: 'waiting' // Or 'delayed' if it has a backoff strategy
            });
        } else if (jobState === 'completed') {
            console.warn(`[RETRY] Job ID ${jobId} is already completed. Not retrying.`);
            return res.status(409).json({ // 409 Conflict
                success: false,
                message: `Job ID ${jobId} is already completed and cannot be retried.`,
                jobId: job.id,
                currentState: jobState
            });
        } else if (jobState === 'active' || jobState === 'waiting' || jobState === 'delayed') {
            console.warn(`[RETRY] Job ID ${jobId} is in state '${jobState}'. Not retrying as it's not failed.`);
            return res.status(409).json({ // 409 Conflict
                success: false,
                message: `Job ID ${jobId} is currently in state '${jobState}' and cannot be retried directly.`,
                jobId: job.id,
                currentState: jobState
            });
        }
        else {
             // Handle other states if necessary, or simply do nothing 
            console.warn(`[RETRY] Job ID ${jobId} is in unexpected state '${jobState}'. Not retrying.`);
            return res.status(409).json({ // 409 Conflict
                success: false,
                message: `Job ID ${jobId} is in state '${jobState}' and cannot be retried.`,
                jobId: job.id,
                currentState: jobState
            });
        }

    } catch (error) {
        console.error(`[ERROR] Failed to retry job ID ${jobId}:`, error);
        res.status(500).json({
            success: false,
            message: `Failed to retry job ID ${jobId}`,
            details: error.message
        });
    }
});

/**
 * Endpoint to delete a specific queue job by its ID.
 * Uses a DELETE request as this is a destructive action.
 */
app.delete('/jobs/delete/:id', async (req, res) => {
    console.log(`[DELETE] Attempting to delete job ID: ${req.params.id}`);
    const jobId = req.params.id;

    if (!jobId) {
        return res.status(400).json({
            success: false,
            message: 'Job ID is required to delete a job.'
        });
    }

    try {
        const job = await queue.getJob(jobId);

        if (!job) {
            console.warn(`[DELETE] Job ID ${jobId} not found in queue.`);
            return res.status(404).json({
                success: false,
                message: `Job ID ${jobId} not found.`
            });
        }

        const jobState = await job.getState();
        console.log(`[DELETE] Job ID ${jobId} current state: ${jobState}`);

        await job.remove(); // Bull's built-in method to remove a job from the queue
        console.log(`[DELETE] Job ID ${jobId} successfully deleted from the queue.`);

        return res.status(200).json({
            success: true,
            message: `Job ID ${jobId} was deleted from the queue.`,
            jobId: job.id,
            previousState: jobState
        });

    } catch (error) {
        console.error(`[ERROR] Failed to delete job ID ${jobId}:`, error);
        res.status(500).json({
            success: false,
            message: `Failed to delete job ID ${jobId}`,
            details: error.message
        });
    }
});

// Health check endpoint for Docker Compose and API readiness check
app.get('/health', async (_, res) => {
    try {
        // Ping Redis to check connectivity
        const redisStatus = await queue.client.ping();
        if (redisStatus === 'PONG') {
            res.status(200).send('[STATUS] MLE file processing queue ready and connected to Redis.');
        } else {
            res.status(503).send('[STATUS] MLE file processing queue not connected to Redis (ping failed).');
        }
    } catch (error) {
        console.error(' - [ERROR] Health check failed:', error.message);
        res.status(503).send(`[STATUS] MLE file processing queue unhealthy: ${error.message}`);
    }
});

/** 
 * Endpoint for getting queue status
 * Provides detailed information about the queue status, job counts, and job details.
 */
app.get('/queue/status', async (_, res) => {
    try {
        // For 'server' status, we assume true if this endpoint is reachable and processing.
        // The 'redis' status will come from the ping.
        const serverReadyStatus = true;

        const [redisPingResult, jobCountsResult, allJobsResult] = await Promise.allSettled([
            queue.client.ping(),
            queue.getJobCounts(['active', 'completed', 'delayed', 'failed', 'waiting']),
            // Fetch all jobs for detailed listing, limit to 1000 as in original
            queue.getJobs(['active', 'completed', 'delayed', 'failed', 'waiting'], 0, 1000)
        ]);

        const status = {
            server: serverReadyStatus, // This app is the server, so if it responds, it's 'ready'
            redis: redisPingResult.status === 'fulfilled' && redisPingResult.value === 'PONG'
        };

        const counts = jobCountsResult.status === 'fulfilled' ? jobCountsResult.value : {};
        const rawJobs = allJobsResult.status === 'fulfilled' ? allJobsResult.value : [];

        const formattedJobs = await Promise.all((rawJobs || []).map(async (job) => {
            const state = await job.getState();
            return {
                jobId: job.id,
                data: JSON.stringify(job.data), // Stringify job data as requested
                finishedOn: job.finishedOn,
                processedOn: job.processedOn,
                status: state,
                timestamp: job.timestamp,
                // Ensure error is stringified if it's an object, or null if not present
                error: (job.stacktrace || job.failedReason) ? JSON.stringify(job.stacktrace || job.failedReason) : null
            };
        }));

        res.status(200).json({
            status: status,
            counts: counts,
            data: formattedJobs
        });

    } catch (error) {
        console.error(' - [ERROR] Failed to get detailed queue status:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve detailed queue status', details: error.message });
    }
});

app.listen(appPort, appHost, () => {
    console.log(`Queue API listening on ${appHost}:${appPort}`);
    console.log(' - Garbage Collection is', !!global.gc ? 'available.' : 'not available.');
});

// --- Bull Job Processing ---
// Process jobs from the queue
// For async functions, throwing an error is enough for Bull to mark the job as failed.
queue.process(concurrentJobs, async (job) => { 
    try {
        console.log(`[PROCESSING] JOB ${job.id} / TYPE ${job.name} - ${new Date(job.timestamp).toLocaleString()}`);
        // Process the job using the worker function
        await processJob(job);
    } catch (error) {
        console.error('[ERROR] Error processing job:', error);
        // Bull automatically handles throwing an error to mark the job as failed and retry
        throw error;
    } finally {
        if (global.gc) {
            console.log(' - Forcing garbage collection...');
            global.gc();
            console.log(' - Garbage collection forced.');
        } else {
            console.log(' - Garbage collection is not exposed.');
        }
    }
});