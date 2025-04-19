/*!
 * MLP.API.Services.Queries.Users
 * File: users.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Get all user roles (except Super Administrator).
 *
 * @return {Function} SQL query function
 */

export function getRoles() {
    return {
        sql: `SELECT *
              FROM user_roles
              ORDER BY id`,
        data: [],
    };
}

/**
 * Update user role.
 *
 * @param {String} name
 * @param {String} label
 * @return {Function} SQL query function
 */

export function updateRole(name, label) {
    return {
        sql: `UPDATE user_roles
              SET 
                  name = $1::varchar, 
                  label = $1::varchar
              WHERE name = $1::varchar RETURNING *`,
        data: [name, label],
    };
}

/**
 * Insert user role.
 *
 * @param {String} name
 * @param {String} label
 * @return {Function} SQL query function
 */

export function insertRole(name, label) {
    return {
        sql: `INSERT INTO user_roles(name, label)
              VALUES($1::varchar, $2::integer) RETURNING *`,
        data: [name, label],
    };
}

/**
 * Delete user role.
 *
 * @param {String} name
 * @return {Function} SQL query function
 */

export function removeRole(name) {
    return {
        sql: `DELETE 
              FROM user_roles
              WHERE name = $1::varchar RETURNING *`,
        data: [name],
    };
}

/**
 * Query: Get user permissions settings.
 *
 * @return {Object} query binding
 */

export function getPermissions() {
  return {
    sql: `
        SELECT *
        FROM user_permissions`,
    data: [],
  };
}