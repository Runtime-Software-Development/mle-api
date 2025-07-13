/*!
 * MLP.API.Controllers.Users
 * File: users.controller.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description
 * 
 * 1. auth.validate(access_token): This service is called 
 * in the login function to check if the user is already 
 * logged in.
 * 
 * 2. auth.authenticate(credentials): This service is 
 * called in the login function to authenticate the user's 
 * credentials against Keycloak.
 * 
 * 3. auth.logout(access_token, refresh_token): This service 
 * is called in the logout function to log out the user's 
 * session in Keycloak.
 * 
 * 4. auth.refresh(req): This service is called in the refresh 
 * function to refresh the user's token.
 */

/**
 * Module dependencies.
 * @private
 */

import * as auth from '../services/auth.services.js';
import valid from '../lib/validate.utils.js';
import { prepare } from '../lib/api.utils.js';
import { getRoleData } from '../services/users.services.js';

/**
 * Controller initialization.
 *
 * @src public
 */

let roleLabels = {};

/**
 * Initialize controller. Called once on controller load.
 * Gets user role labels from database.
 *
 * @src public
 */
export const init = async () => {
    // get designated role labels
    roleLabels = await getRoleData();
};


/**
 * User sign-in using email and password.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @method post
 * @src public
 *
 * Checks if user is currently logged-in, and if so, throws a redundantLogin error.
 * Otherwise, validates user credentials and authenticates against Keycloak.
 *
 * If authentication is successful, sends an access token and refresh token
 * to the client inside a cookie, and returns a 200 response with a success
 * message, user email, user role, and user role label.
 *
 * If authentication fails, throws an error.
 */
export const login = async (req, res, next) => {

    // get access token from request cookie
    const { access_token=null } = req.signedCookies || [];

    let credentials;
    try {
        // check if user is currently logged-in
        const isAuth = await auth.validate(access_token);
        if (isAuth) return next(new Error('redundantLogin'));

        // otherwise, validate user credentials
        const { email = '', password = '' } = req.body || {};

        credentials = {
            email: valid.load(email).isEmail().data,
            password: valid.load(password).isPassword().data,
        }
    }
    catch (err) {
        return next(err);
    }

    // authenticate credentials against Keycloak
    await auth.authenticate(credentials)
        .then(data => {

            // get token value
            const { refresh_token=null, access_token=null } = data || {};

            // send access token to the client inside a cookie
            res.cookie("access_token", access_token, {httpOnly: true, sameSite: 'strict', signed: true, secure: true});
            res.cookie("refresh_token", refresh_token, {httpOnly: true, sameSite: 'strict', signed: true, secure: true});

            // get user role label
            const role = data.roles.length > 0
                ? roleLabels.find(r => r.name === data.roles[0])
                : 'Registered';

            // successful login
            res.status(200).json(
                prepare({
                    message: {msg: 'Login successful!', type: 'success'},
                    view: 'login',
                    user: {
                        email: credentials.email,
                        role: data.roles,
                        label: role.label || 'Registered'
                    }})
            );
        })
        .catch(err => {return next(err)});

};


/**
 * User sign-out.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @method post
 * @src public
 *
 * Gets access token from signed cookie, logs out the user's session in Keycloak,
 * and then removes the access token and refresh token from the signed cookie.
 *
 * If Keycloak did not properly log out user, throws a logoutFailed error.
 *
 * If logout is successful, returns a 200 response with a success message.
 */
export const logout = async (req, res, next) => {

    // get access token from cookie
    const { access_token=null, refresh_token=null } = req.signedCookies || [];

    // logout session in Keycloak
    await auth.logout(access_token, refresh_token)
        .then(kcRes => {

            // Keycloak did not properly log out user
            if (kcRes.status !== 204)
                throw Error('logoutFailed');

            // successful session logout
            res.cookie("access_token", access_token, {httpOnly: true, sameSite: 'strict', signed: true, maxAge: 0, secure: true});
            res.cookie("refresh_token", refresh_token, {httpOnly: true, sameSite: 'strict', signed: true, maxAge: 0, secure: true});
            res.status(200).json(
                prepare({
                    message: {msg: 'Successfully logged out!', type: 'success'}
                })
            );
        })
        .catch(err => {return next(err)});

};

/**
 * Refresh user token.
 *
 * If refresh token is invalid or not found, sets an empty value for both
 * access token and refresh token inside the client's cookies.
 *
 * If refresh token is valid, refreshes the token (Keycloak API), stores
 * the new access token inside an http-only cookie, and returns a 200
 * response with a success message and user data.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @method get
 * @src public
 */
export const refresh = async (req, res, next) => {

    // refresh token (Keycloak API)
    await auth.refresh(req)
        .then(data => {
            // reset tokens if a token is not found or is invalid
            if (!data) {
                res.cookie("access_token", '', {httpOnly: true, sameSite: 'strict', signed: true, maxAge: 0, secure: true});
                res.cookie("refresh_token", '', {httpOnly: true, sameSite: 'strict', signed: true, maxAge: 0, secure: true});
                return res.status(200).json(
                    prepare({
                        message: {msg: 'Token reset.', type: 'success'}
                    })
                );
            }

            // store new access token inside an http-only cookie
            // TODO: include secure: true on production site
            const { access_token=null, refresh_token=null } = data || {};
            res.cookie("access_token", access_token, {httpOnly: true, sameSite: 'strict', signed: true});
            res.cookie("refresh_token", refresh_token, {httpOnly: true, sameSite: 'strict', signed: true});

            // get user role label
            const role = data.roles.length > 0
                ? roleLabels.find(r => r.name === data.roles[0])
                : 'Administrator';

            // successful token refresh
            res.status(200).json(
                prepare({
                    message: {msg: 'Token refreshed.', type: 'success'},
                    user: {
                        email: data.email,
                        role: data.roles,
                        label: role.label,
                        expiry: data.exp
                    }
                })
            );
        })
        .catch(err => {return next(err)});
};
