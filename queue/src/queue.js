
/**
 * @module queue
 * @description This module provides functionality to manage a Redis queue using Bull.
 * It includes functions to retrieve job statuses and manage the queue.
 * @version 3.0.0
 * @license MIT
 */

import redis from 'redis';
import dotenv from 'dotenv';
dotenv.config();

'use strict';

// Configuration constants from environment variables
const maxJobs = process.env.MLE_QUEUE_MAX_JOBS ? parseInt(process.env.MLE_QUEUE_MAX_JOBS) : 1000;

const getQueueServerOrigin = () => {
  if (process.env.MLE_QUEUE_SERVER_URL) {
    try {
      return new URL(process.env.MLE_QUEUE_SERVER_URL).origin;
    } catch (err) {
      console.warn('[queue] Invalid MLE_QUEUE_SERVER_URL:', process.env.MLE_QUEUE_SERVER_URL);
    }
  }

  let host = process.env.MLE_QUEUE_HOST || 'localhost';
  let port = process.env.MLE_QUEUE_PORT || '3002';

  try {
    if (host.includes('://')) {
      const parsed = new URL(host);
      host = parsed.hostname;
      port = port || parsed.port;
    }

    const origin = new URL(`http://${host}`);
    origin.port = port;
    return origin.origin;
  } catch (err) {
    console.warn('[queue] Invalid queue host/port values; defaulting to localhost:3002', err.message);
    return 'http://localhost:3002';
  }
};

/**
   * 
   * Test Redis connection
   * @returns 
   */

export async function testRedisServerConnection() {

    const redisUrl = `redis://${process.env.MLE_REDIS_HOST}:${process.env.MLE_REDIS_PORT}`;
    console.log(`Checking connection to Redis server at: ${redisUrl}...`);

    // create a Redis client to test the connection
    const maxRetries = 5; // Maximum number of retries
    let retryCount = 0; // Initialize retry count
    const client = redis.createClient({ 
      url: redisUrl,
      socket: {
        reconnectStrategy: retries => {
            // Generate a random jitter between 0 – 200 ms:
            const jitter = Math.floor(Math.random() * 200);
            // Delay is an exponential back off, (times^2) * 50 ms, with a maximum value of 2000 ms:
            const delay = Math.min(Math.pow(2, retries) * 50, 2000);
            retryCount = retries; // Update retry count
            return retryCount < maxRetries && delay + jitter;
        }
      }
    });

    // handle Redis connection error
    client.on('error', (err) => {
      console.log(' - [ERROR] Redis Client Connection ', err);
      if (err.code === 'ECONNREFUSED' && retryCount >= maxRetries) {
        console.error('[FAILED] Failed to connect to Redis after multiple retries.');
        // You might want to emit an event or handle this failure more explicitly here
      }
    });
  
    try {
      await client.connect();
      console.log(' - [SUCCESS] Redis server is ready and accessible.');
      return true;
    } catch (error) {
      console.error(' - [FAILED] Failed to connect to Redis server:', error);
      return false;
    }
    finally {
        client.ok && client.quit(); // Ensure the client is closed in case of error
    }
  }

  /**
 * Waits for the Redis server to become available and lists pending jobs.
 * @param {Bull.Queue} queue - The Bull queue instance.
 * @returns {Promise<void>} - Resolves when the Redis server is ready and jobs are listed.
 */
export const initializeQueue = async (queue) => {
    console.log('Waiting for Redis server to become available...');
    let redisReady = false;

    while (!redisReady) {
        try {
            await testRedisServerConnection();
            redisReady = true;
            console.log('Redis server is available.');
        } catch (error) {
            console.error('Redis server not available. Retrying in 5 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        }
    }

    // List pending jobs in the queue
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);
    if (jobs.length > 0) {
        console.log(`Found ${jobs.length} pending jobs in the queue:`);
        jobs.forEach((job) => {
            console.log(` - Job ID: ${job.id}, Name: ${job.name}, Data: ${JSON.stringify(job.data)}`);
        });
    } else {
        console.log('No pending jobs in the queue.');
    }
};


// /**
//  * Retrieves all jobs from a Redis queue.
//  *
//  * @async
//  * @return {Promise<void>} - Resolves when finished.
//  * @throws {Error} - If queue is not available.
//  */
// export const getQueueJobs = async (redisQueue) => {
//     try {
//         console.log(` - [INFO] Retrieving jobs from the queue ${process.env.MLE_QUEUE_NAME}...`, redisQueue?.client?.status);
//       // Check if the Redis client is ready before proceeding
//       if (!redisQueue?.client?.status || redisQueue.client.status !== 'ready') {
//         console.error('[ERROR] Redis client is not ready. Cannot perform operation.');
//         return false;
//       }
//         // retrieve jobs from the queue (up to maxJobs)
//         const res = await redisQueue.getJobs(null, 0, maxJobs, true);
//         return {
//             status: {
//                 redis: await redisQueue.client.ping() === 'PONG'
//             },
//             counts: await redisQueue.getJobCounts(['active', 'completed', 'delayed', 'failed', 'waiting']),
//             data: await Promise.all((res || []).map(async (job) => {
//                 const state = await job.getState();
//                 return {
//                     jobId: job.id,
//                     data: JSON.stringify(job?.data),
//                     attemptsMade: job?.attemptsMade,
//                     finishedOn: job?.finishedOn,
//                     processedOn: job?.processedOn,
//                     status: state.toUpperCase(),
//                     timestamp: job?.timestamp,
//                     error: (job?.stacktrace || job?.failedReason) ? JSON.stringify(job.stacktrace || job.failedReason) : null
//                 };
//             }))
//         };

//     } catch (err) {
//         console.error(err);
//         throw new Error('queueUnavailable');
//     }
// };



/**
 * Asynchronous function to check if the separate Queue server (HTTP endpoint) is ready.
 * @returns {Promise<boolean>} a promise that resolves to true if the queue server is ready, false otherwise
 */
export async function isQueueServerReady() {
  try {
    const url = `${getQueueServerOrigin()}/health`;
    const response = await fetch(url, { timeout: 5000 }); // 5 second timeout
    return response.ok; // If response status is 2xx, it's considered OK
  } catch (error) {
    console.error('Error checking Queue Server readiness:', error.message);
    return false;
  }
}

/**
 * Connect to Redis message broker using BullMQ.
 * This instance is used for queue operations.
 * @returns {Queue} - The Bull queue instance.
 * @throws {Error} - If the queue server is not ready or Redis connection fails.
 * @private
 */
const queueName = 'file_processor';

let queue = new Queue(queueName, {
    redis: {
        host: process.env.MLE_REDIS_HOST,
        port: parseInt(process.env.MLE_REDIS_PORT, 10), // Ensure port is an integer
        maxRetriesPerRequest: null,
        enableOfflineQueue: true, 
        connectTimeout: 5000, 
    },
});

// Create a separate Redis client for direct connection logging/pings outside BullMQ's managed client.
// Note: Bull's 'queue.client' is the recommended way to interact with Redis for Bull-related operations.
const redisClientForStatus = createClient({
    url: `redis://${process.env.MLE_REDIS_HOST}:${parseInt(process.env.MLE_REDIS_PORT, 10)}`,
    // password: process.env.MLE_REDIS_PASSWORD, // Add password if required
});

redisClientForStatus.on('error', error => {
    console.error('ERROR initialising Redis connection (standalone client):', error.message);
});

redisClientForStatus.on('connect', async () => {
    console.log(
        `Connected to Redis (standalone client): ${process.env.MLE_REDIS_HOST}:${process.env.MLE_REDIS_PORT}`,
    );
});

// Connect the standalone client
redisClientForStatus.connect().catch(err => {
    console.error("Failed to connect standalone Redis client:", err.message);
});


/**
 * Retrieves all jobs from a Redis queue.
 *
 * @async
 * @return {Promise<Object>} - Resolves with queue status and job data.
 * @throws {Error} - If queue operations fail (e.g., Redis not available).
 */
export const getQueueJobs = async (queue) => {
    try {
        // Use Promise.allSettled to handle potential individual failures gracefully
        const [serverReady, redisPing, jobCounts, allJobs] = await Promise.allSettled([
            isQueueServerReady(), // Check the external queue server HTTP endpoint
            queue.client.ping(),  // Check Bull's Redis connection
            queue.getJobCounts(['active', 'completed', 'delayed', 'failed', 'waiting']),
            queue.getJobs(['active', 'completed', 'delayed', 'failed', 'waiting'], 0, 1000)
        ]);

        const status = {
            server: serverReady.status === 'fulfilled' ? serverReady.value : false,
            redis: redisPing.status === 'fulfilled' && redisPing.value === 'PONG'
        };

        const counts = jobCounts.status === 'fulfilled' ? jobCounts.value : {};
        const res = allJobs.status === 'fulfilled' ? allJobs.value : [];


        return {
            status: status,
            counts: counts,
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
        console.error('Error in getQueueJobs:', err);
        throw new Error('queueUnavailable');
    }
};

/**
 * Fetches job details from Redis via Bull's API.
 * This is the correct way to get details of a job managed by Bull.
 *
 * @param {string} jobId - The ID of the job to fetch
 * @returns {Promise<Object|null>} - The job details as an object, or null if the job is not found
 */
async function getJobDetails(jobId) {
    try {
        const job = await queue.getJob(jobId); // Use Bull's getJob method
        if (job) {
            const state = await job.getState();
            return {
                jobId: job.id,
                data: job.data, // Data is already an object, no need to parse if Bull stored it as such
                finishedOn: job.finishedOn,
                processedOn: job.processedOn,
                status: state,
                timestamp: job.timestamp,
                error: (job.stacktrace || job.failedReason) ? (job.stacktrace || job.failedReason) : null // Keep as object/string
            };
        } else {
            console.log(`Job with ID ${jobId} not found in Bull queue.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching job details for ID ${jobId}:`, error);
        return null;
    }
}


/**
     * Retry a job with the given ID.
     *
     * @param {string} jobId - The ID of the job to retry.
     * @returns {Promise<void>} - Resolves when the job has been retried.
     */
export const retryJob = async (jobId) => { // Exporting for external use
    // Display date for retry
    const display_format_options = { year: 'numeric', month: 'short', day: 'numeric' };
    const date_object = new Date(Date.now());
    const date_display = date_object.toLocaleDateString("en-US", display_format_options); // provide in specified format
    const time_display = date_object.toLocaleTimeString("en-US", {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: "America/Chicago", // Ensure this timezone is correct for your use case
        timeZoneName: 'short'
    });
    const datetime_display = `${date_display} | ${time_display.slice(0, -4)}`;

    // Fetch job by ID
    const job = await queue.getJob(jobId);

    if (!job) {
        throw new Error(`Job with ID ${jobId} not found.`);
    }

    // Update job to include retried datetime
    // Note: Bull's .update() saves the data.
    await job.update({ ...job.data, "retried": datetime_display });

    // Retry job
    await job.retry();
}