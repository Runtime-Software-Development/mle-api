/*!
 * MLP.API.Services.Authenticate
 * File: auth.services.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import jwt from 'jsonwebtoken';
// import jwksClient from 'jwks-rsa';
import fetch from 'node-fetch';
import { getRoleData } from './users.services.js';
import AbortController from "abort-controller";

/**
 * KeyCloak Settings (set in ENV)
 * Check endpoints at http://localhost:8081/realms/MLP-Explorer/.well-known/openid-configuration
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
 * Compose request urls (KeyCloak endpoints)
 *
 * @public
 */

const kcBaseURL = `${settings.serverURL}/realms/${settings.realm}/protocol/openid-connect`
const kcTokenURL = `${kcBaseURL}/token`;
const kcInfoURL = `${kcBaseURL}/userinfo`;
const kcLogoutURL = `${kcBaseURL}/logout`;

/**
 * Compose authentication request.
 *
 * @public
 */

export function getOpts(payload=null, method='POST') {

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

/**
 * Helper function to extract roles from a decoded Keycloak JWT token.
 * It prioritizes `realm_access.roles` and falls back to `resource_access[clientId].roles`.
 *
 * @param {Object} decoded - The decoded JWT token payload.
 * @param {string} clientId - The client ID to look for in resource_access.
 * @returns {Array<string>} An array of roles, or an empty array if no roles are found.
 */
function extractRolesFromDecodedToken(decoded, clientId) {
    let roles = [];

    // First, try to get roles from realm_access
    if (decoded && decoded.realm_access && Array.isArray(decoded.realm_access.roles)) {
        roles = decoded.realm_access.roles;
    }
    // If not found in realm_access, try resource_access
    else if (decoded && decoded.resource_access && decoded.resource_access[clientId] && Array.isArray(decoded.resource_access[clientId].roles)) {
        roles = decoded.resource_access[clientId].roles;
    }

    return roles;
}


// const client = jwksClient({
//   jwksUri: 'https://${settings.serverURL}/realms/${settings.realm}/protocol/openid-connect/certs'
// });

/**
 * Retrieves the signing key from the JWKS endpoint and calls the callback with it.
 * @param {Object} header - The JWT header containing the key ID.
 * @param {function} callback - The callback to call with the signing key.
 * @private
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// Returns true if the token is valid, false otherwise
export async function validateSignature(token) {
  return new Promise((resolve) => {
    jwt.verify(token, getKey, {
      audience: settings.clientId,
      issuer: 'https://${settings.serverURL}/realms/${settings.realm}',
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Authenticate user password. Returns JSON web token on successful
 * authentication of password.
 *
 * @public
 * @return {String} JSON web token
 * @param {Object} user credentials
 */

export const authenticate = async ({email:email, password:password}) => {

    // Prepare credentials for openid-connect token request
    // ref: http://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
    const payload = {
        username: email,
        password: password,
        grant_type: settings.grantType,
        client_secret: settings.clientSecret,
        client_id: settings.clientId
    };

    // send request to API
    let data = await fetch(kcTokenURL, getOpts(payload))
        .then(response => response.json())
        .then(data => {
            const { error=null } = data || {};
            if (error) {
                throw error;
            }
            return data
        })
        .catch(err => {
            console.error('KeyCloak error:', err);
            throw new Error('invalidCredentials');
        });

    if (!data) return null;

    // decode KeyCloak JWT token
    const { access_token='' } = data || {};
    const decoded = jwt.decode(access_token);

    // extract user roles from decoded token
    data.roles = extractRolesFromDecodedToken(decoded, settings.clientId);

    return data;
}

/**
 * Authorize user access based on permissions set for user role.
 * - validates current access token
 * - if invalid, refreshes token
 *
 * @param req
 * @param res
 * @param {Array} allowedRoles
 * @src public
 */

export const authorize = async (req, res, allowedRoles) => {

    // authorize all for 'visitor' restrictions
    if ( allowedRoles.includes('visitor') ) return null;

    // get current tokens
    const { access_token=null, refresh_token=null } = req.signedCookies || {};

    // test that tokens exist
    if (!access_token || !refresh_token)
        throw new Error('noToken');

    // assign access token
    let token = access_token;

    // validate access token
    const isValid = await validate(access_token);

    // if invalid, try to refresh the token
    if (!isValid) {

        const data = await refresh(req);

        // check if refresh token has expired or is invalid
        if (!data) throw new Error('noAuth');

        // get token value
        const { access_token=null, refresh_token=null } = data || {};
        token = access_token;

        // send access token to the client inside a cookie
        res.cookie("access_token", access_token, {httpOnly: true, sameSite: 'strict', signed: true, secure: true});
        res.cookie("refresh_token", refresh_token, {httpOnly: true, sameSite: 'strict', signed: true, secure: true});
    }

    // verify token
    const decoded = jwt.decode(token);

    // reject invalid user data
    if (!decoded)
        throw new Error('invalidToken');

    // extract user roles from decoded token
    const roles = extractRolesFromDecodedToken(decoded, settings.clientId);

    // deny users with lesser admin privileges
    // i.e. check if any user roles are allowed.
    if ( !allowedRoles.some(role => roles.includes(role)) )
        throw new Error('restricted');

    // get user role label
    const roleData = await getRoleData();
    const role = roles.length > 0 ? roleData.find(r => r.name === roles[0])  : 'Administrator';

    console.log('User roles:', roles, 'Role:', role);

    // compose user data
    return {
        email: decoded.email,
        role: roles,
        label: role.label || 'Registered'
    }

}

// export const authorize = async (req, res, allowedRoles) => {
//     // 1. Visitor role: authorize all
//     if (allowedRoles.includes('visitor')) return null;

//     let token = null;
//     let usedHeader = false;

//     // 2. Prefer Authorization header (for service accounts)
//     const authHeader = req.headers['authorization'] || req.headers['Authorization'];
//     if (authHeader && authHeader.startsWith('Bearer ')) {
//         console.log('Service Request')
//         token = authHeader.substring(7);
//         usedHeader = true;
//     } else {
//         // 3. Fallback to cookies (for user authentication)
//         const { access_token = null, refresh_token = null } = req.signedCookies || {};
//         if (!access_token || !refresh_token)
//             throw new Error('noToken');
//         token = access_token;
//     }

//     // 4. Validate access token
//     // let isValid = await validate(token);

//     // 5. If invalid and using cookies, try to refresh
//     if (!isValid && !usedHeader) {
//         // Only attempt to refresh for user (cookie-based)
//         const data = await refresh(req);

//         if (!data) throw new Error('noAuth');

//         const { access_token: new_access_token = null, refresh_token: new_refresh_token = null } = data || {};
//         token = new_access_token;

//         // Set new cookies for browser
//         res.cookie("access_token", new_access_token, { httpOnly: true, sameSite: 'strict', signed: true, secure: true });
//         res.cookie("refresh_token", new_refresh_token, { httpOnly: true, sameSite: 'strict', signed: true, secure: true });

//         // isValid = await validate(token) || true;
//     }

//     // if (!isValid)
//     //     throw new Error('invalidToken');

//     // 6. Decode and extract roles
//     const decoded = jwt.decode(token);
//     if (!decoded)
//         throw new Error('invalidToken');

//     const roles = extractRolesFromDecodedToken(decoded, settings.clientId);

//     if (!allowedRoles.some(role => roles.includes(role)))
//         throw new Error('restricted');

//     // 7. Compose user data
//     const roleData = await getRoleData();
//     const role = roles.length > 0 ? roleData.find(r => r.name === roles[0]) : { label: 'Administrator' };

//     return {
//         email: decoded.email,
//         role: roles,
//         label: role.label || 'Registered'
//     };
// };

/**
 * Logout user from KeyCloak.
 *
 * @public
 * @return {Promise} JSON web token
 * @param access_token
 * @param refresh_token
 */

export const logout = async (access_token, refresh_token) => {

    // stop logout if no token found
    if (!access_token) return null;

    const payload = {
        client_secret: settings.clientSecret,
        client_id: settings.clientId,
        refresh_token: refresh_token
    };

    // request options for logout (KeyCloak API)
    const opts = getOpts(payload, 'POST');

    // send logout request to KeyCloak endpoint
    return await fetch(kcLogoutURL, opts);
}

/**
 * Validate access token in session cookie with KeyCloak server.
 *
 * @public
 * @return {Promise} JSON web token
 * @param access_token
 */

export const validate = async (access_token) => {

    // stop verification if no token found
    if (!access_token) return null;

    // check whether access token is invalid
    const opts = getOpts(null, 'GET');
    opts.headers = {
        authorization: 'Bearer ' + access_token,
        grant_type: settings.grantType,
        client_secret: settings.clientSecret,
        client_id: settings.clientId
    };

    // send a request to the 'userinfo' endpoint on Keycloak
    // to validate access token
    return await fetch(kcInfoURL, opts).then(res => {
        if (!res || res.status !== 200) return null;
        return res;
    });
}

/**
 * Refreshes the user's session token.
 *
 * @public
 * @return {Promise} a JSON object with user data, or null if no token found
 * @param req
 *
 * If the refresh token is invalid or has expired, a 'noauth' error is thrown.
 * If the KeyCloak server does not respond with a 200 status, or if the response
 * is not valid JSON, the function returns null.
 *
 * The returned object has the following structure:
 *
 * {
 *   access_token: string
 *   refresh_token: string
 *   email: string
 *   roles: string[]
 * }
 *
 * The access token is a JSON Web Token containing user data, which is extracted
 * and appended to the returned object.
 */
export const refresh = async (req) => {

    // get tokens from cookie
    const { refresh_token=null } = req.signedCookies || [];

    // stop refresh if no tokens found
    if (!refresh_token) return null;

    const payload = {
        grant_type: 'refresh_token',
        client_secret: settings.clientSecret,
        client_id: settings.clientId,
        refresh_token: refresh_token
    };

    // request options for refresh (KeyCloak API)
    const opts = getOpts(payload, 'POST');

    // refresh token via KeyCloak endpoint
    let data = await fetch(kcTokenURL, opts)
        .then(res => {
            // token is invalid or session is not active
            if (!res || res.status !== 200) throw new Error('noauth');
            return res
        })
        .then(res => res.json())
        .catch(err => {
            console.warn('KeyCloak error:', err);
            return null;
        });

    // extract user data if response valid
    if (data) {

        // decode KeyCloak JWT token
        const { access_token = '' } = data || {};
        const decoded = jwt.decode(access_token);

        // append user email, roles to fetched data
        data.email = decoded.email;
        data.roles = extractRolesFromDecodedToken(decoded, settings.clientId);
        data.exp = decoded.exp;
    }
    return data;

}


/**
 * Checks the health of Keycloak by hitting its /health/ready endpoint.
 * @returns {Promise<string>} 'healthy', 'unhealthy', or 'unreachable'
 */
export async function checkKeycloakHealth() {
    const KEYCLOAK_URL = process.env.MLE_KC_SERVER_URL || 'http://keycloak_server:8081';
    const KEYCLOAK_HEALTH_PATH = '/health/ready'; // Keycloak's readiness endpoint
    const FETCH_TIMEOUT_MS = 5000; // 5 seconds timeout

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(`${KEYCLOAK_URL}${KEYCLOAK_HEALTH_PATH}`, { signal: controller.signal });

        clearTimeout(timeoutId); // Clear the timeout if the request completes in time

        if (response.ok) { // response.ok is true for 2xx status codes
            return 'healthy';
        } else {
            const errorText = await response.text();
            console.warn(`[Health Check] Keycloak returned non-200 status: ${response.status}. Response: ${errorText}`);
            return 'unhealthy';
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Health Check] Timeout connecting to Keycloak: ${error.message}`);
        } else {
            console.error(`[Health Check] Network error connecting to Keycloak: ${error.message}`);
        }
        return 'unreachable';
    }
}
