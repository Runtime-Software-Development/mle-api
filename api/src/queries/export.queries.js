/*!
 * MLP.API.Services.Queries.Nodes
 * File: nodes.queries.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

'use strict';

/**
 * Query: Get surveyor data for GIS applications.
 *
 * @return {Object} query binding
 */

export function getGIS() {
    return {
        sql: `SELECT 
                surveyors.nodes_id as surveyor_id, 
                surveys.nodes_id as survey_id,
                string_agg(
                    surveyors.given_names || ' ' || surveyors.last_name,
                    ','
                    ORDER BY
                    surveyors.given_names,
                    surveyors.last_name
                    ) surveyor,
                (
                    SELECT MIN(survey_seasons.year)
                    FROM survey_seasons
                    WHERE survey_seasons.owner_id = surveys.nodes_id
                ) AS survey_year_start,
                (
                    SELECT MAX(survey_seasons.year)
                    FROM survey_seasons
                    WHERE survey_seasons.owner_id = surveys.nodes_id
                ) AS survey_year_end,
                survey_seasons.year as survey_season,
                stations.name as station_name,
                stations.lng as longitude,
                stations.lat as latitude,
                stations.elev as elevation,
                modern_visits.date as repeat_date,
                (
                    SELECT COUNT(*) 
                    FROM modern_captures 
                    WHERE modern_captures.owner_id = survey_seasons.nodes_id 
                       OR modern_captures.owner_id = modern_visits.nodes_id
                       OR modern_captures.owner_id = stations.nodes_id
                       OR modern_captures.owner_id = locations.nodes_id
                ) AS repeat_count,
                (
                    SELECT COUNT(*)
                    FROM historic_captures
                    WHERE historic_captures.owner_id = survey_seasons.nodes_id
                       OR historic_captures.owner_id = surveys.nodes_id
                       OR historic_captures.owner_id = historic_visits.nodes_id
                ) AS historic_count
              FROM surveyors
                LEFT OUTER JOIN surveys ON surveyors.nodes_id = surveys.owner_id
                LEFT OUTER JOIN survey_seasons ON surveys.nodes_id = survey_seasons.owner_id
                LEFT OUTER JOIN stations ON survey_seasons.nodes_id = stations.owner_id
                LEFT OUTER JOIN historic_visits ON stations.nodes_id = historic_visits.owner_id
                LEFT OUTER JOIN modern_visits ON stations.nodes_id = modern_visits.owner_id
                LEFT OUTER JOIN locations ON modern_visits.nodes_id = locations.owner_id
              GROUP BY 
                       surveyors.nodes_id, 
                       surveys.nodes_id, 
                       survey_seasons.nodes_id,
                       stations.nodes_id,
                       historic_visits.nodes_id,
                       modern_visits.nodes_id,
                       locations.nodes_id;`,
        data: [],
    };
}