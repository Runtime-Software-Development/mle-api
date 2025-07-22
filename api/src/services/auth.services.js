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
import fetch from 'node-fetch';
import { getRoleData } from './users.services.js';

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

    // append user roles to fetched data
    data.roles = decoded.resource_access[settings.clientId].roles;

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

    // get current user role and check authorization
    const {roles=[]} = decoded.resource_access[settings.clientId];

    // deny users with lesser admin privileges
    // i.e. check if any user roles are allowed.
    if ( !allowedRoles.some(role => roles.includes(role)) )
        throw new Error('restricted');

    // get user role label
    const roleData = await getRoleData();
    const role = roles.length > 0 ? roleData.find(r => r.name === roles[0])  : 'Administrator';

    // compose user data
    return {
        email: decoded.email,
        role: roles,
        label: role.label || 'Registered'
    }

}

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
 * Validate access token in session cookie with Keycloak server.
 *
 * @public
 * @return {Promise} JSON web token
 * @param req
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
        data.roles = decoded.resource_access[settings.clientId].roles;
    }
    return data;

}