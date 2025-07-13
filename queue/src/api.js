/**
 * @file db.ts
 * @description Initializes and exports a PostgreSQL connection pool using the 'pg' library.
 * @version 3.0.0
 * @license MIT
 * @copyright (c) 2025 Runtime Software Development Inc.
 */

import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
dotenv.config();

'use strict';

/**
 * KeyCloak Settings (set in ENV)
 * Check endpoints at http://localhost:8080/auth/realms/MLP-Explorer/.well-known/openid-configuration
 * @private
 */

const settings = {
    serverURL: process.env.MLE_KC_SERVER_URL,
    realm: process.env.MLE_KC_REALM,
    clientId: process.env.MLE_KC_CLIENT_ID,
    clientSecret: process.env.MLE_KC_CLIENT_SECRET,
    grantType: 'password',
    ssl: "external",
    bearerOnly: true
}

/**
 * Compose authentication request.
 *
 * @public
 */

export function getOpts(payload = null, method = 'POST') {

    // compose request headers/options
    const opts = {
        method: method,
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin', // to include cookie data
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
    };

    // add GET payload (if exists)
    if (payload) {
        // request access token
        opts.body = Object.keys(payload)
            .map(key => {
                const encodedKey = encodeURIComponent(key);
                const encodedValue = encodeURIComponent(payload[key]);
                return `${encodedKey}=${encodedValue}`;
            })
            .join("&");
    }

    return opts;
}

/*
 * Get Keycloak service token
 * @returns {Promise<string>} - service token.
 */
export const getServiceToken = async () => {
    const payload = {
        grant_type: 'client_credentials',
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
    };

    // Keycloak service token endpoint
    const kcTokenURL = `${settings.serverURL}/realms/${settings.realm}/protocol/openid-connect/token`;

    // Request options
    const opts = getOpts(payload, 'POST');

    try {
        // fetch service token from Keycloak
        const response = await fetch(kcTokenURL, opts);
        if (response.status !== 200) {
            throw new Error('[ERROR] Failed to fetch service token. Status: ' + response.status);
        }
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('[ERROR] Failed to fetch service token:', error.message);
        return null;
    }
};

/**
 * @description Make a service request to the API. Requires a service token.
 * @param {*} url 
 * @param {*} method 
 * @param {*} data 
 * @returns 
 */
const makeServiceRequest = async (url, method = 'GET', data = null) => {
    try {
        // Request service token from Keycloak
        const token = await getServiceToken();
        if (!token) {
            throw new Error('[ERROR] Failed to obtain service token');
        }

        // Define form data
        const formData = new FormData();

        // Add fields
        // Note: FormData accepts only three types of elements viz. string, Buffer and Stream
        for (const [key, value] of Object.entries(data)) {
            console.log('FormData:', key, value);
            formData.append(key, String(value));
        }

        // Set request options
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData || null,
        };

        const response = await fetch(url, opts);
        if (!response.ok) {
            throw new Error(`[ERROR] Request failed with status ${response.status}; Payload: `, data);
        }

        return response.json();

    } catch (error) {
        console.error(`[ERROR] Failed to make service request: ${error.message}`);
        throw error;
    }
};

/**
 * Send a request to the API to update file metadata.
 *
 * @param {Object} file - File data object.
 * @param {Object} file_model - File metadata object.
 * @returns {Promise<Object>} - Promise resolving to processing results.
 */
export const updateFileMetadata = async (file, file_model) => {
    try {

        const apiUrl = path.join(process.env.MLE_API_BASEURL, file?.file_type, 'edit', String(file?.id));
        const fileId = file?.id;

        // update file metadata only
        const result = await makeServiceRequest(apiUrl, 'POST', file_model);

        console.log(`[INFO] File metadata updated successfully for file ID ${fileId}.`);

        return result;
    } catch (error) {
        console.error(`[ERROR] File metadata update failed for ID ${file?.id}: `, error);
        throw error;
    }
}
