/*!
 * MLP.API.Controllers.Other
 * File: other.controller.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

import { prepare } from '../lib/api.utils.js';
import { getShowcaseCaptures } from '../services/other.services.js';
import pool from '../services/db.services.js';

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
        client.release(true);
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
        await client.release(true);
    }
};
