/*!
 * MLP.API.Tests.Models
 * File: users.test.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

import path from 'path';
import { app, BASE_URL } from './setup.js';
import request from 'supertest';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { humanize, toSnake } from '../src/lib/data.utils.js';

/** 
 * Create mock items.
 * @private
 */

const rootNodes = ['projects', 'map_objects', 'surveyors'];

/**
 * Generate a string of random ASCII characters.
 *
 * @param {Number} [length=32] The length of the string to generate.
 * @returns {String} A string of random ASCII characters.
 */
function generateRandomASCII(length = 8) {
    return Array(length).fill(0).map(() => String.fromCharCode(32 + Math.random() * 95)).join('');
  }

/*
 * Generate Random year value (4 bytes)
 *
 * @private
 * @return {Number} Random Year
 * 
 */
const randomYear = () => {return Math.floor(Math.random() * (1960 - 1930 + 1)) + 1930};


// mock data (owner id)
const owners = {
    projects: 5,
    surveyors: 151,
    surveys: 151,
    surveySeasons: 151,
    stations: 312,
    historicVisits: 805,
    historicCaptures: 4328,
    historicImages: 4328, 
    modernVisits: 805,
    locations: 6635,
    modernCaptures: 7848,   
    modernImages: 7848,
}

// mock data (requests)
const requests = {
    projects: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('name', testValue)
            .field('description', testValue)
            .expect(200)
    },
    surveyors: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('given_names', testValue)
            .field('last_name', testValue)
            .field('short_name', testValue)
            .field('affiliation', testValue)
            .expect(200)
    },
    surveys: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.surveys)
            .field('name', testValue)
            .field('historical_map_sheet', testValue)
            .expect(200)
    },
    surveySeasons: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.surveySeasons)
            .field('year', randomYear())
            .field('geographic_coverage', testValue)
            .field('record_id', 0)
            .field('jurisdiction', testValue)
            .field('affiliation', testValue)
            .field('archive', testValue)
            .field('collection', testValue)
            .field('location', testValue)
            .field('sources', testValue)
            .field('notes', testValue)
            .expect(200)
    },
    stations: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.stations)
            .field('name', testValue)
            .field('lat', 100.1)
            .field('long', 100.1)
            .field('elev', 3000)
            .field('nts_sheet', testValue)
            .field('archive', testValue)
            .field('collection', testValue)
            .field('location', testValue)
            .field('sources', testValue)
            .field('notes', testValue)
            .expect(200)
    },
    historicVisits: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.historicVisits)
            .field('date', '1927-01-01')
            .field('comments', testValue)
            .expect(200)
    },
    modernVisits: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.modernVisits)
            .field('date', '2005-08-19')
            .field('start_time', '14:00:00')
            .field('finish_time', '17:00:00')
            .field('pilot', 'TEST')
            .field('rw_call_sign', testValue)
            .field('visit_narrative', testValue)
            .field('illustration', false)
            .field('weather_narrative', testValue)
            .field('weather_temp', 14)
            .field('weather_ws', 25)
            .field('weather_gs', 34)
            .field('weather_pressure', 101)
            .field('weather_rh', 15)
            .field('weather_wb', 22)
            .expect(200)
    },
    locations: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.locations)
            .field('location_narrative', testValue)
            .field('location_identity', testValue)
            .field('lat', 100.1)
            .field('long', 100.1)
            .field('elev', 100.1)
            .field('legacy_photos_start', 5)
            .field('legacy_photos_end', 8)
            .expect(200)
    },
    historicCaptures: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.historicCaptures)
            .field('plate_id', '529')
            .field('fn_photo_reference', testValue)
            .field('f_stop', 555)
            .field('shutter_speed', 34)
            .field('focal_length', 12)
            .field('capture_datetime', '2014-07-09 16:49:00.572006')
            .field('cameras_id', 6)
            .field('lens_id', null)
            .field('digitization_location', 'LAC')
            .field('digitization_datetime', '2014-07-09 16:49:00.572006')
            .field('lac_ecopy', 'IDENTIFIER')
            .field('lac_wo', 'IDENTIFIER')
            .field('lac_collection', 'IDENTIFIER')
            .field('lac_box', 'IDENTIFIER')
            .field('lac_catalogue', 'IDENTIFIER')
            .field('condition', 'DESCRIPTION')
            .field('comments', testValue)
            .expect(200)
    },
    modernCaptures: async (route, cookie, testValue) => {
        return await request(app)
            .post(route)
            .set('Cookie', cookie)
            .field('owner_id', owners.modernCaptures)
            .field('fn_photo_reference', 'IDENTIFIER')
            .field('f_stop', 55)
            .field('shutter_speed', 55)
            .field('focal_length', 56)
            .field('capture_datetime', '2014-07-09 16:49:00.572006')
            .field('cameras_id', 6)
            .field('lens_id', null)
            .field('lat', 100.1)
            .field('long', 100.1)
            .field('elev', 100.1)
            .field('azimuth', 300)
            .field('comments', testValue)
            .field('alternate', true)
            .expect(200)
    }
}


// Test all defined models
Object.keys(requests).forEach(modelName => {

    // define model route, label, and item data placeholder
    let modelRoute = toSnake(modelName);
    let modelLabel = humanize(modelName);
    let item, cookie;

    // set admin credentials
    let admin = {
        email: process.env.MLE_API_EMAIL,
        password: process.env.MLE_API_PASS,
        role: 'super_administrator'
    }

    // CRUD tests for node model
    describe(`Test ${modelLabel} Model CRUD`, () => {

        // get cookie
        before( async () => {
            const res = await request(app)
                .post(path.join(BASE_URL, 'login'))
                .set('Accept', 'application/json')
                .send({
                    email: admin.email,
                    password: admin.password
                })
                .catch((err) => err);
            cookie = res.headers['set-cookie']
        });

        afterEach( async () => {});

        // get request for given model 
        const req = requests[modelName];

        // create new item
        it(`Create, update and destroy new ${modelLabel}`, async () => {

            // get route
            const route = rootNodes.includes(modelName)
                ? path.join('/', modelRoute, 'new')
                : path.join('/', modelRoute, 'new', String(owners[modelName]));

            const testValue = generateRandomASCII();

            // send form data
            const res = await req(route, cookie, testValue);

            item = res.body.data;

            const show = await request(app)
                .get(path.join(BASE_URL, modelRoute, 'show', String(item?.metadata?.nodes_id)))
                .set('Accept', 'application/json')
                .expect(200)

            // compare mock data to response data
            expect(item?.metadata).to.deep.equal(show?.body?.data?.metadata); 

            // destroy item
            const destroy = await request(app)
                .post(path.join(BASE_URL, modelRoute, 'remove', String(item?.metadata?.nodes_id)))
                .set('Accept', 'application/json')
                .set('Cookie', cookie)
                .expect(200)

            console.log(`DELETED ${modelLabel}: ${!!destroy.body.data}`, )

            
        });

        // /**
        //  * Show item data.
        //  * @private
        //  */

        // it('Show item data', async () => {
        //     console.log(item, modelRoute, BASE_URL)
        //     const res = await request(app)
        //         .get(path.join(BASE_URL, modelRoute, 'show', item.nodes_id))
        //         .set('Accept', 'application/json')
        //         .expect(200)
        //         .send();

        //     // compare mock data to response data
        //     compare(item, res.body.data);

        // });

        /**
         * Update item data.
         * @private
         */

        // it('Update item data', async () => {
        //     const res = await request(app)
        //         .post(path.join(BASE_URL, modelRoute, 'edit', item.nodes_id))
        //         .set('Accept', 'multipart/form-data')
        //         .set('Content-Type', 'multipart/form-data')
        //         .send(formData);

        //     expect(res.status).to.equal(200);
        //     compare(formData, res.body.data);

        // });

        /**
         * Delete new item.
         * @private
         */

        // it('Delete created item', async () => {
            
        // });

    });

});
