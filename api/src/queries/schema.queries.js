/*!
 * MLP.API.Services.Queries.Schema
 * File: schema.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Get all of the table names in the MLP database.
 *
 * @return {Object} query binding
 */

export function getTables() {
    return {
        sql: `SELECT table_name
              FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE';`,
        data: [],
    };
}

/**
 * Query: Get columns of target table incl. foreign key references.
 * Selection from pg_catalog.pg_constraint schema information.
 * Reference: https://stackoverflow.com/a/21125640
 * col: column name
 * type: column datatype
 * fk_table: referenced table
 *
 * @public
 * @param {String} targetTable
 * @return {Object} query binding
 */

export function getColumns(targetTable) {
    return {
        sql: `WITH fk_cols AS (
            SELECT col.attname    as col,
                   rel_fk.relname as ref_table
--                 fk_col.attname as ref_id
            FROM pg_catalog.pg_constraint con
                     INNER JOIN pg_catalog.pg_class rel
                                ON rel.oid = con.conrelid
                     INNER JOIN pg_catalog.pg_class rel_fk
                                ON rel_fk.oid = con.confrelid
                     INNER JOIN pg_catalog.pg_namespace nsp
                                ON nsp.oid = connamespace
                     INNER JOIN pg_catalog.pg_attribute col
                                ON (col.attrelid = rel.oid AND ARRAY [col.attnum] <@ con.conkey)
--                      INNER JOIN pg_catalog.pg_attribute fk_col
--                                 ON (fk_col.attrelid = rel_fk.oid AND ARRAY[fk_col.attnum] <@ con.confkey)
            WHERE nsp.nspname = 'public'
              AND rel.relname = $1::varchar)

              select column_name as col, data_type, fk_cols.ref_table
              from information_schema.columns
                       LEFT JOIN fk_cols ON column_name = fk_cols.col
              where table_name = $1::varchar
              order by fk_cols.col;`,
        data: [targetTable],
    };
}

/**
 * Query: Check node relation allowed for given node and owner types.
 *
 * @return {Object} query binding
 * @param nodeID
 * @param ownerID
 */

export function isRelatable(nodeID, ownerID) {
    return {
        sql: `WITH 
                n AS (
                    SELECT nodes.type
                    FROM nodes
                    WHERE id = $1::integer
                   ),
                o AS (
                   SELECT nodes.type
                   FROM nodes
                   WHERE id = $2::integer
                )
                SELECT exists(
                           SELECT dependent_type
                           FROM node_relations
                           WHERE owner_type IN (SELECT type FROM o)
                             AND dependent_type IN (SELECT type FROM n)
                    );`,
        data: [nodeID, ownerID],
    };
}