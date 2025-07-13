/*!
 * MLP.API.Services.Queries
 * File: index.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

import * as schema from './schema.queries.js';
import * as defaults from './defaults.queries.js';
import * as nodes from './nodes.queries.js';
import * as files from './files.queries.js';
import * as metadata from './metadata.queries.js';
import * as comparisons from './comparisons.queries.js';
import * as search from './search.queries.js';
import * as exporter from './export.queries.js';
import * as users from './users.queries.js';
import * as stats from './stats.queries.js';
import * as other from './other.queries.js';
import * as maps from './maps.queries.js';

/**
 * Index of module exports.
 * @public
 */

export default {
    schema: schema,
    defaults: defaults,
    nodes: nodes,
    files: files,
    metadata: metadata,
    comparisons: comparisons,
    search: search,
    export: exporter,
    users: users,
    stats: stats,
    other: other,
    maps: maps
};
