/*!
 * MLP.API.Services.Queries.Other
 * File: other.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Get showcase images from designated project
 * - selects unsorted capture images stored under a project
 *   with the key descriptor 'showcase'.
 * - capture images are used for the frontpage carousel
 *
 * @return {Object} query binding
 */

export function showcase() {
    let sql = `
            SELECT * 
            FROM nodes
            WHERE nodes.owner_id IN (
                SELECT nodes_id 
                FROM projects 
                WHERE projects.description = 'showcase'
            )
            ;`
    // let sql = `SELECT * FROM projects WHERE projects.description = 'showcase';`
    return {
        sql: sql,
        data: [],
    };
}

/**
 * Query: Add queue job to database
 * - inserts record of job metadata
 * 
 * @param {Object} data - queue job data
 * @param {string} data.job_id - job_id from redis
 * @param {string} data.status - status from redis
 * @param {string} data.completed_at - timestamp when the job was last updated
 * @param {string} data.error_message - error message when the job failed
 * @param {Object} data.additional_data - additional data from the job
 * 
 * @return {Object} query binding
 */
export function addQueueRecord(data) {
    const {job_id, status, completed_at, error_message, additional_data} = data || {};

    let sql = `
            INSERT INTO queue_jobs 
            (job_id, status, completed_at, error_message, additional_data)
            VALUES ($1, $2, $3, $4, $5) returning *;`
    
    return {
        sql: sql,
        data: [job_id, status, completed_at, error_message, additional_data],
    };
    
}
