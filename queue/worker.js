#!/usr/bin/env node

/*!
 * MLE.Queue.Worker
 * File: worker.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * Version 2.0
 * MIT Licensed
 *
 * Description
 *
 * File processing queue API.
 *
 * Revisions
 * - 29-07-2023   Refactored out Redis connection as separate queue service.
 */

'use strict';

import express from 'express';
import Queue from 'bull';
import { processJob } from './worker.services.js'; 


/**
 * Initialize main Express instance.
 */

const app = express();

/**
 * Get port from environment and store in Express
 */

const QUEUE_HOST = process.env.MLE_QUEUE_HOST;
const QUEUE_PORT = process.env.MLE_QUEUE_PORT;
const CONCURRENT_JOBS = 5;

// set queue port
app.set('port', QUEUE_PORT);

app.get('/', (_, res) => {
    res.send('Ready')
})

app.listen(QUEUE_PORT, () => {
    console.log(`Queue listening on ${QUEUE_HOST}:${QUEUE_PORT}`);
    console.log('\n- (Node) Exposed Garbage Collection:', !!global.gc);
});

/**
 * Connect to Redis message broker
 * - allows files to be queued for processing
 * @private
 */

try {
    // Define the queue service limited to maximum concurrent jobs
    let queue = new Queue('file_processor', {
        redis: {
            host: process.env.MLE_REDIS_HOST,
            port: process.env.MLE_REDIS_PORT,
        },
        concurrency: CONCURRENT_JOBS
    });

    // Connect to Redis Queue and process jobs
    queue.on('process', (job) => {
        // Emit an event to notify the React app
        io.emit('job:update', { jobId: job.id, state: 'processing' });
    });
    // Listen for completed jobs
    queue.on('completed', (job) => {
        io.emit('job:update', { jobId: job.id, state: 'completed' });
    });

    // Listen for failed jobs
    queue.on('failed', (job) => {
        io.emit('job:update', { jobId: job.id, state: 'failed' });
    });

    queue.on('process', (job) => {
        redisClient.publish('job:updates', JSON.stringify({ jobId: job.id, state: 'processing' }));
      });
      
      queue.on('completed', (job) => {
        redisClient.publish('job:updates', JSON.stringify({ jobId: job.id, state: 'completed' }));
      });
      
      queue.on('failed', (job) => {
        redisClient.publish('job:updates', JSON.stringify({ jobId: job.id, state: 'failed' }));
      });

    // Connect to Redis Queue and process jobs
    queue.process(async (job) => {
        try {
            console.log(`[PENDING] JOB No. ${job.id} / TYPE ${job.name} - ${new Date(job.timestamp).toLocaleString()}`);
            await processJob(job, console.error);
        } catch (error) {
            console.error('Error processing job:', error);
        } finally {
            // force garbage collection to prevent heap memory leaks
            if (global.gc) {
                console.log('Forcing garbage collection...');
                global.gc();
                console.log('Garbage collection forced.');
            } else {
                console.log('Garbage collection is not exposed.');
            }
        }
    });
}
catch (err) {
    console.error(err);
}