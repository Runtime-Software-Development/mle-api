/*!
 * MLP.API.Services.Queries.Model
 * File: defaults.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Database rows limit.
 */

const limit = 50;

/**
 * Generate query: Find all records in table.
 *
 * @param {Object} model
 * @param {int} offset
 * @param order
 * @return {Function} query
 * @public
 */

export function getAll(model, offset = 0, order='') {

    // (optional) order by attribute
    const orderby = order ? `ORDER BY ${order}` : '';

    return function() {
        return {
            sql: `SELECT * 
                    FROM ${model.name} 
                    ${orderby}
                    LIMIT ${limit} 
                    OFFSET ${offset};`,
            data: [],
        };
    };
}

/**
 * Query: Get grouped metadata for given owner and group type.
 *
 * @param {String} ownerID
 * @param {String} modelType
 * @param {String} groupType
 * @param {String} groupCol
 * @return {Object} query binding
 */

export function getGroup(ownerID, modelType, groupType, groupCol = 'group_type') {
    let sql = `
            SELECT *
            FROM ${modelType}
            WHERE owner_id = $1::integer 
              AND ${groupCol} = $2::varchar`;
    return {
        sql: sql,
        data: [ownerID, groupType],
    };
}

/**
 * Generate query: Find record by model instance.
 *
 * @param {Object} model
 * @return {Function} query
 * @public
 */

export function select(model) {
    return function(item) {
        let sql = `SELECT * 
                FROM ${model.name} 
                WHERE ${model.idKey} = $1::integer;`;
        return {
            sql: sql,
            data: [item.id],
        };
    };
}

/**
 * Generate query: Find record by associated node.
 *
 * @param {Object} node
 * @return {Function} query
 * @public
 */

export function selectByNode(node) {
    let sql = `SELECT * 
            FROM ${node.type} 
            WHERE nodes_id = $1::integer;`;
    return {
        sql: sql,
        data: [node.id]
    };
}

/**
 * Generate query: Find record by field.
 *
 * @param {String} model
 * @param value
 * @param {String }field
 * @param {String} datatype
 * @return {Function} query
 * @public
 */

export function selectByField(model, field, value, datatype) {
    let sql = `SELECT * 
            FROM ${model} 
            WHERE ${field} = $1::${datatype};`;
    return {
        sql: sql,
        data: [value]
    };
}

/**
 * Generate query: Find record by associated file.
 *
 * @param {Object} file
 * @return {Function} query
 * @public
 */

export function selectByFile(file) {
    let sql = `SELECT * 
            FROM ${file.file_type} 
            WHERE files_id = $1::integer;`;
    return {
        sql: sql,
        data: [file.id]
    };
}

/**
 * Generate query: Find records by owner.
 *
 * @param {String} ownerID
 * @param {Object} model
 * @return {Function} query function
 * @public
 */

export function selectByOwner(ownerID, model) {
    let sql = `SELECT *
            FROM ${model}
            WHERE ${model}.owner_id = $1::integer`;
    return {
        sql: sql,
        data: [ownerID],
    };
}

/**
 * Generate query: Find records by model type.
 *
 * @param {Object} model
 * @return {Function} query function
 * @public
 */

export function selectByModel(model) {
    let sql = `SELECT * 
            FROM ${model}`;
    return {
        sql: sql,
        data: [],
    };
}

/**
 * Generate query: Insert new record into database.
 *
 * @param {Object} model
 * @param {Array} timestamps
 * @param upsert
 * @return {Function} query binding function
 * @public
 */

export function insert(
    model,
    upsert=false,
    timestamps = ['created_at', 'updated_at']
) {

    // return null if instance is null
    if (!model) return null;

    // filter ignored columns
    // - do not ignore if model is for a node or file
    const ignore = model.node || model.file ? [] : [model.idKey];
    const cols = Object
        .keys(model.attributes)
        .filter(key => !ignore.includes(key));

    // generate prepared sql
    let index = 1;
    const vals = cols.map(key => {
        const placeholder = timestamps.includes(key) ? `NOW()` : `$${index++}`;
        return `${placeholder}::${model.attributes[key].type}`;
    });

    // upsert assignment values
    index = 1;
    const upsertCols = cols.filter(key => !timestamps.includes(key));
    const assignments = cols
        .filter(key => !ignore.includes(key))
        .map(attr => {
        // handle timestamp placeholders defined in arguments
        const placeholder = timestamps.includes(attr) ? `NOW()` : `$${index++}`;
        // map returns conjoined prepared parameters in order
        return [attr, `${placeholder}::${model.attributes[attr].type}`].join('=');
    });

    // construct prepared statement (insertion or merge)
    let sql = upsert
        ? `INSERT INTO ${model.name} (${cols.join(',')})
            VALUES (${vals.join(',')})
            ON CONFLICT (${upsertCols.join(',')})
            DO UPDATE SET ${assignments.join(',')}
            RETURNING *;`
        : `INSERT INTO ${model.name} (${cols.join(',')})
            VALUES (${vals.join(',')})
            RETURNING *;`

    // return query function
    return function(item) {
        // filter input data to match insert parameters
        // filters: ignored, timestamp, ID attributes
        let data = Object.keys(item.attributes)
            .filter(key => !ignore.includes(key) && !timestamps.includes(key))
            .map(key => {return item.attributes[key].value});

        // collate data as value array
        return {
            sql: sql,
            data: data
        };
    };
}

/**
 * Generate query: Update record in table.
 *
 * @param {Object} model
 * @param {Array} timestamps
 * @return {Function} sql query
 * @public
 */

export function update(model, timestamps = ['updated_at']) {

    // return null if instance is null
    if (!model) return null;

    // filter ignored columns:
    // - DO NOT ignore ID, CREATE_AT columns if model is a node instance
    const ignore = model.node ? [] : [model.idKey, 'created_at'];
    const cols = Object
        .keys(model.attributes)
        .filter(key => !ignore.includes(key));

    // generate prepared statement value placeholders
    // - NOTE: index shift to account for ID and created datetime values
    let index = 2;
    const assignments = cols.map(attr => {
        // handle timestamp placeholder defined in arguments
        const placeholder = timestamps.includes(attr)
            ? `NOW()`
            : `$${index++}`;

        // map returns conjoined prepared parameters in order
        return [attr, `${placeholder}::${model.attributes[attr].type}`].join('=');
    });

    let sql = `UPDATE "${model.name}" 
                SET ${assignments.join(',')} 
                WHERE ${model.idKey} = $1::integer
                RETURNING *;`;

    // return query function
    return function (item) {

        // position ID, creation datetime values at front of array
        let data = [item.id];

        // filter input data to match update parameters
        data.push(...Object.keys(item.attributes)
            .filter(key => !ignore.includes(key) && !timestamps.includes(key))
            .map(key => {return item.attributes[key].value}));

        return {
            sql: sql,
            data: data,
        };
    };
}

/**
 * Generate query: Delete record from database. Returns
 * null if this is a node or file removal.
 *
 * @param {Object} model
 * @return {function(*): {data: [*], sql: string}} sql query
 * @public
 */

export function remove(model) {
    return !model.node && !model.file
        ? function(item) {
            return {
                sql: `DELETE FROM ${model.name} 
            WHERE ${model.idKey} = $1::integer
            RETURNING *;`,
                data: [item.id],
            };
        }
        : null;
}
