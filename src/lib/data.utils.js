/*!
 * MLP.API.Utilities.Data
 * File: data.utils.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description:
 * Utility functions for data processing.
 * 
 * Revisions:
 * - [22-09-2024] Added toArray method.
 */

'use strict';

import crypto from 'crypto';
import uid from 'uid-safe';

/**
 * Group array rows by common key
 *
 * @param {Array} arr - The source array
 * @param {String} key - The key to group by
 * @returns {Object} An object with grouped values
 * @src public
 *
 * @example
 * const data = [
 *   { id: 1, name: 'John' },
 *   { id: 2, name: 'John' },
 *   { id: 3, name: 'Jane' }
 * ];
 *
 * const grouped = groupBy(data, 'name');
 * console.log(grouped);
 * // {
 * //   John: [
 * //     { id: 1, name: 'John' },
 * //     { id: 2, name: 'John' }
 * //   ],
 * //   Jane: [
 * //     { id: 3, name: 'Jane' }
 * //   ]
 * // }
 */
export function groupBy(arr, key) {
    if (arr == null) return null;
    return arr.reduce(function(rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
}

/**
 * Convert a `Map` to a standard
 * JS object recursively.
 *
 * @param {Map} map to convert.
 * @returns {Object} converted object.
 * @example
 * const data = new Map([
 *   ['foo', 'bar'],
 *   ['baz', 1],
 *   ['qux', { foo: 'bar', baz: 1 }]
 * ]);
 *
 * const obj = mapToObj(data);
 * console.log(obj); // { foo: 'bar', baz: 1, qux: { foo: 'bar', baz: 1 } }
 */
export const mapToObj = (map) => {
    const out = Object.create(null);
    map.forEach((value, key) => {
        if (value instanceof Map) {
            /**
             * Recursively convert the nested Map to an object.
             * This is necessary for Maps that contain other Maps.
             */
            out[key] = mapToObj(value);
        } else {
            /**
             * If the value is not a Map, just set the key-value pair
             * in the output object.
             */
            out[key] = value;
        }
    });
    return out;
}

/**
 * Convert a Map of key-value pairs to an array of objects.
 *
 * Example input:
 * Map {
 *   'foo[0].bar': 'value1',
 *   'foo[0].baz': 'value2',
 *   'foo[1].bar': 'value3',
 *   'foo[1].baz': 'value4'
 * }
 *
 * Example output:
 * [
 *   { bar: 'value1', baz: 'value2' },
 *   { bar: 'value3', baz: 'value4' }
 * ]
 *
 * @param {Map} data
 * @return {Array}
 */
export function toArray(data) {
    const result = [];
  
    for (const [key, value] of data.entries()) {
      const match = key.match(/\[(\d+)\]/);
      if (!match) return result;
  
      const index = parseInt(match[1]);
      if (isNaN(index)) return result;
  
      const field = key.split('.')[1];
      result[index] = { ...result[index], [field]: value };
    }
  
    return result;
  }

/**
 * Sanitize data by PostGreSQL data type. Note for composite
 * user-defined types (i.e. coord, camera_settings, dims) the
 * data array is converted to a string representation of its tuple.
 * Empty strings are converted to NULL to trigger postgres non-empty
 * constraints.
 *
 * @param data
 * @param {String} datatype
 * @return {Object} cleanData
 * @src public
 */

export function sanitize(data, datatype) {
    const sanitizers = {
        'boolean': function() {
            return !!data;
        },
        'varying character': function() {
            // Replaces HTML tags with null string.
            return ((data===null) || (data===''))
                ? ''
                : data.toString().replace( /(<([^>]+)>)/ig, '');
        },
        'integer': function() {
            return isNaN(parseInt(data)) ? null : parseInt(data);
        },
        'double precision': function() {
            return isNaN(parseFloat(data)) ? null : parseFloat(data);
        },
        'float': function() {
            return isNaN(parseFloat(data)) ? null : parseFloat(data);
        },
        'json': function() {
            return JSON.stringify(data);
        },
        'USER-DEFINED': function() {
            return !Array.isArray(data) ? null : `(${data.join(',')})`;
        },
        'text': function() {
            // Replaces HTML tags with null string.
            return ((data===null) || (data===''))
                ? ''
                : data.toString().replace( /(<([^>]+)>)/ig, '');
        },
        'default': function() {
            return data === '' ? null : data;
        },
    };
    return (sanitizers[datatype] || sanitizers['default'])();
}


/**
 * Make snake/camel case strings readable.
 *
 * @param {String} str
 * @return {String} readable string
 * @src public
 */

export function humanize(str) {
    str = toSnake(str);
    let i, frags = str.split('_');
    for (i = 0; i < frags.length; i++) {
        frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    return frags.join(' ');
}

/**
 * Make camelCase strings snake_case.
 *
 * @param {String} str
 * @return {String} snake_case string
 * @src public
 */

export const toSnake = (str) => {
    return str.replace(/[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`);
};

/**
 * Generate standard UUID.
 *
 * @public
 * @return {String} UUID
 */

export function genUUID() {
    return uid.sync(36);
}

/**
 * Generate Random ID (16 bytes)
 *
 * @public
 * @return {String} Random ID
 */

export function genID() {
    return crypto.randomBytes(16).toString('hex');
}