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
import { getQueueJobs } from '../services/queue.services.js';

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
        await client.release(true);
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

        const rootPath = process.env.NODE_PATH;
        const logDir = path.join(rootPath, 'logs');

        // read log files
        fs.readdir(logDir, (err, files) => {
            if (err) {
              console.error(err);
              return next(err);
            } else {
              const logFiles = files.filter(file => path.extname(file) === '.log');
              const logContents = [];
        
              // read each log file
              logFiles.forEach(file => {
                const filePath = path.join(logDir, file);
                fs.readFile(filePath, 'utf8', (err, data) => {
                  if (err) {
                    return next(err);
                  } else {
                    const logArray = data.split('\n');
                    logContents.push({file, contents: logArray});
                    if (logContents.length === logFiles.length) {
                        res.status(200).json(
                            prepare({
                                view: 'logs',
                                data: logContents, // data,
                            }));
                    }
                  }
                });
              });
            }
          });
    } catch (err) {
        return next(err);
    }
};


/**
 * Administrative queued jobs request controller.
 * Returns a list of Redis queue items.
 *
 * @param {Object} _
 * @param {Object} res
 * @param {Function} next
 * @src public
 */
export const jobs = async (_, res, next) => {
    try {
        const { data, counts, status } = await getQueueJobs() || {};
        // get list of Redis queue items
        res.status(200).json(
            prepare({
                view: 'dashboard',
                data: { jobs: data || [], counts: counts || {}, status }, // data,
            }));
    } catch (err) {
        return next(err);
    }
};
