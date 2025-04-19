/*!
 * MLP.API.Services.Queries.Search
 * File: search.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Full text search query for node tables.
 *
 * @param {String} tbl
 * @param fields
 * @param {Array} q
 * @param {Integer} limit
 * @param {Integer} offset
 * @return {Object} query binding
 */

export function fulltextNodeSearch(tbl, fields, q, offset=0, limit=5) {
    let queryString = q.join(' | ');
    const requiredFields = fields.required;
    const coalescedFields = fields.coalesce.map(field => {
            return `coalesce(${field}, '')`
        });
    const searchFields = requiredFields.concat(coalescedFields).join( ` || ' ' || `);
    const blurbFields = fields.coalesce.join(', ');
    const heading = fields.heading.join(', ');

    return {
        sql: `
            WITH search_items as (
                SELECT
                   nodes_id as id,
                   CONCAT_WS(' ', ${heading}) as heading,
                   CONCAT_WS(' ', ${blurbFields}) as blurb,
                   ts_rank(searchtext, query) AS rank
                FROM ${tbl}, to_tsvector('english', ${searchFields}) searchtext, to_tsquery($1::varchar) query
                WHERE searchtext @@ query
                GROUP BY id, heading, blurb, rank, searchtext
            )
            SELECT 
                   search_items.id, 
                   search_items.heading, 
                   search_items.blurb, 
                   search_items.rank,
                   n.type as type,
                   n.updated_at as last_modified,
                   (SELECT COUNT(*) FROM search_items) as total
            FROM search_items
            JOIN nodes n ON n.id = search_items.id
            GROUP BY 
                     search_items.id, 
                     search_items.heading, 
                     search_items.blurb,
                     search_items.rank,
                     type,
                     last_modified
            ORDER BY rank DESC
            OFFSET ${offset}
            LIMIT ${limit};
            `,
        data: [queryString],
    };
}

/**
 * Query: Full text search query for metadata tables.
 *
 * @param {String} tbl
 * @param fields
 * @param {Array} q
 * @param {Integer} limit
 * @param {Integer} offset
 * @return {Object} query binding
 */

export function fulltextMetadataSearch(tbl, fields, q, offset=0, limit=5) {
    let queryString = q.join(' | ');
    const requiredFields = fields.required;
    const coalescedFields = fields.coalesce.map(field => {
        return `coalesce(${field}, '')`
    });
    const searchFields = requiredFields.concat(coalescedFields).join( ` || ' ' || `);
    const blurbFields = fields.coalesce.join(', ');
    const heading = fields.heading.join(', ');

    return {
        sql: `
            WITH search_items as (
                SELECT
                   owner_id,
                   CONCAT_WS(' ', ${heading}) as heading,
                   CONCAT_WS(' ', ${blurbFields}) as blurb,
                   ts_rank(searchtext, query) AS rank
                FROM ${tbl}, to_tsvector('english', ${searchFields}) searchtext, to_tsquery($1::varchar) query
                WHERE searchtext @@ query
                GROUP BY owner_id, heading, blurb, rank, searchtext
            )
            SELECT 
                search_items.owner_id as id,
                nodes.type as type,
                search_items.heading,
                search_items.blurb,
                search_items.rank,
                nodes.updated_at as last_modified,
               (SELECT COUNT(*) FROM search_items) as total
            FROM search_items
            JOIN nodes ON nodes.id = search_items.owner_id
            ORDER BY rank DESC
            OFFSET ${offset}
            LIMIT ${limit};
            `,
        data: [queryString],
    };
}


/**
 * Query: Full text search query for participant table.
 *
 * @param fields
 * @param {Array} q
 * @param {Integer} limit
 * @param {Integer} offset
 * @return {Object} query binding
 */

export function fulltextParticipantSearch(fields, q, offset=0, limit=5) {
    let queryString = q.join(' | ');
    const requiredFields = fields.required;
    const coalescedFields = fields.coalesce.map(field => {
        return `coalesce(${field}, '')`
    });
    const searchFields = requiredFields.concat(coalescedFields).join( ` || ' ' || `);
    const blurbFields = fields.coalesce.join(', ');

    return {
        sql: `
            WITH search_items as (
                SELECT
                   id,
                   CONCAT_WS(' ', ${blurbFields}) as blurb,
                   ts_rank(searchtext, query) AS rank
                FROM participants, to_tsvector('english', ${searchFields}) searchtext, to_tsquery($1::varchar) query
                WHERE searchtext @@ query
                GROUP BY id, blurb, rank, searchtext
            ),
            results as (
                SELECT 
                    participant_groups.owner_id as id,
                    nodes.type as type,
                    search_items.blurb,
                    CONCAT_WS(' ', modern_visits.date) as heading,
                    search_items.rank,
                    nodes.updated_at as last_modified
                FROM search_items
                JOIN participant_groups ON participant_groups.participant_id = search_items.id
                    JOIN nodes ON nodes.id = participant_groups.owner_id
                        JOIN modern_visits ON nodes.id = modern_visits.nodes_id
            )
            SELECT *, (SELECT COUNT(*) FROM results) as total
            FROM results
            ORDER BY rank DESC
            OFFSET ${offset}
            LIMIT ${limit};
            `,
        data: [queryString],
    };
}

/**
 * Query: Filename search query for files table.
 *
 * @param {Array} q
 * @param fields
 * @param {Integer} limit
 * @param {Integer} offset
 * @return {Object} query binding
 */

export function fulltextFileSearch(fields, q, offset=0, limit=5) {
    let queryString = q.join(' | ');
    const blurbFields = fields.coalesce.join(', ');
    const heading = fields.heading.join(', ');

    return {
        sql: `
            WITH search_items as (
                SELECT
                   owner_id,
                   CONCAT_WS(' ', ${heading}) as heading,
                   CONCAT_WS(' ', ${blurbFields}) as blurb
                FROM files
                WHERE filename LIKE $1::varchar
                GROUP BY owner_id, heading, blurb
            )
            SELECT 
                search_items.owner_id as id,
                nodes.type as type,
                search_items.heading,
                search_items.blurb,
                nodes.updated_at as last_modified,
               (SELECT COUNT(*) FROM search_items) as total
            FROM search_items
            JOIN nodes ON nodes.id = search_items.owner_id
            OFFSET ${offset}
            LIMIT ${limit};
            `,
        data: ["%" + queryString + "%"],
    };
}
