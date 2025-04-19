/*!
 * MLP.API.Services.Queries.Nodes
 * File: nodes.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

import * as defaults from './defaults.queries.js';

/**
 * Query: Get all node types listed.
 *
 * @return {Object} query binding
 */

export function types() {
    return {
        sql: `SELECT *
              FROM node_types;`,
        data: [],
    };
}

/**
 * Generate query: Retrieve node entry for given ID.
 *
 * @param {integer} id
 * @return {Function} query function / null if no node
 * @public
 */

export function select(id) {
    return {
        sql: `SELECT * 
                FROM nodes 
                WHERE id = $1::integer`,
        data: [id]
    }
}

/**
 * Generate query: Find all records in nodes table for
 * requested model type.
 *
 * @param {Object} model
 * @return {Function} query
 * @public
 */

export function selectByModel(model) {
    return {
        sql: `SELECT * 
                FROM nodes
                WHERE nodes.type=$1::varchar`,
        data: [model],
    };
}

/**
 * Generate query: Find any dependent node by owner id.
 *
 * @return {Function} query function
 * @public
 */

export function hasDependent(id) {
    const sql = `SELECT exists(
            SELECT 1 
            FROM nodes 
            WHERE owner_id = $1::integer 
    )`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Generate query: Retrieve dependent nodes by owner id.
 *
 * @return {Function} query function
 * @public
 */

export function selectByOwner(id) {
    const sql = `SELECT * 
            FROM nodes 
            WHERE owner_id = $1::integer`;
    return {
        sql: sql,
        data: [id],
    };
}

/**
 * Generate query: Retrieve dependent nodes by id array.
 *
 * @return {Function} query function
 * @public
 */

export function filterByIDArray(ids, offset, limit) {
    const sql = `SELECT 
            *, 
            (SELECT COUNT(*) FROM nodes WHERE id = ANY($1)) as total
            FROM nodes 
            WHERE id = ANY($1)
            OFFSET ${offset}
            LIMIT ${limit}`;
    return {
        sql: sql,
        data: [ids],
    };
}

/**
 * Generate query: Insert node entry for given item
 *
 * @param {Object} node
 * @return {Function} query function / null if no node
 * @public
 */

export function insert(node) {
    const fn = defaults.insert(node);
    return fn(node);
}

/**
 * Generate query: Update node entry for given item
 *
 * @param {Object} node
 * @return {Function} query function / null if no node
 * @public
 */

export function update(node) {
    const fn = defaults.update(node);
    return fn(node);
}

/**
 * Generate query: Delete node entry for given item
 *
 * @param {Object} node
 * @return {Function} query function / null if no node
 * @public
 */

export function remove(node) {
    const fn = defaults.remove(node);
    return fn(node);
}