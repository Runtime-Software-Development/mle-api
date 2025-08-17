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

import { server, BASE_URL, compare } from './setup.js';
import mocha from 'mocha';
import { expect } from 'chai';
import * as db from '../src/services/index.services.js';
import { humanize, toSnake } from '../src/lib/data.utils.js';

/**
 * Create mock items.
 * @private
 */

let mockItems = {
    locations: {
        nodes_id: null,
        owner_id: 6635,
        location_narrative: 'TEXT',
        location_identity: 'TEXT',
        lat: 100.1,
        long: 100.1,
        elev: 100.1,
        legacy_photos_start: 5,
        legacy_photos_end: 8
    },
    historicCaptures: {
        nodes_id: null,
        owner_id: 4328,
        plate_id:'529',
        fn_photo_reference: 'TEXT',
        f_stop: 555,
        shutter_speed: 34,
        focal_length: 12,
        capture_datetime: '2014-07-09 16:49:00.572006',
        cameras_id: 6,
        lens_id: null,
        digitization_location: 'LAC',
        digitization_datetime: '2014-07-09 16:49:00.572006',
        lac_ecopy: 'IDENTIFIER',
        lac_wo: 'IDENTIFIER',
        lac_collection: 'IDENTIFIER',
        lac_box: 'IDENTIFIER',
        lac_catalogue: 'IDENTIFIER',
        condition: 'DESCRIPTION',
        comments: 'TEXT'
    },
    modernCaptures:{
        nodes_id: null,
        owner_id: 7848,
        fn_photo_reference: 'IDENTIFIER',
        f_stop: 55,
        shutter_speed: 55,
        focal_length: 56,
        capture_datetime: '2014-07-09 16:49:00.572006',
        cameras_id: 6,
        lens_id: null,
        lat: 100.1,
        long: 100.1,
        elev: 100.1,
        azimuth: 300,
        comments: 'TEXT',
        alternate: true
    }
}

let imgFiles = [
    './test/data/images/historic/hi-0027.tif',
    './test/data/images/modern/ri-0031.tif',
    './test/data/images/uploads/BRI1917_B-21-17.tif',
    './test/data/images/uploads/HB2_A0006431.3FR'
];

let Model;

// Test all defined models
Object.keys(mockItems).forEach(modelName => {

    // convert to snake case
    let modelRoute = toSnake(modelName);
    let modelTable = toSnake(modelName);
    let modelLabel = humanize(modelName);

    // Test model views
    mocha.describe(`Test ${modelLabel} views`, () => {

        // store example record data
        let testItem;

        /**
         * List all items.
         * @private
         */

        mocha.it(`List all ${modelLabel}`, async () => {

            // generate model constructor
            Model = await db.model.create(modelTable);
            let model = new Model();

            await server
                .get(`${BASE_URL}${modelRoute}`)
                .then((res) => {
                    testItem = res.body.data[0];
                    expect(res).to.have.status(200);
                    expect(res.body.data).to.instanceOf(Array);
                    compare(model, res.body.data);
                })
        });

        /**
         * Show item data.
         * @private
         */

        mocha.it(`Show ${modelLabel} item data`, async () => {

            // generate model constructor
            Model = await db.model.create(modelTable);
            let model = new Model();

            await server
                .get(`${BASE_URL}${modelRoute}/${testItem.nodes_id}`)
                .set('Accept', 'application/json')
                .then((res) => {
                    expect(res.status).to.equal(200);
                    compare(model, [res.body.data]);
                })
        });
    });


    /**
     * Load admin data.
     * @private
     */

    let admin = {
        user_id: process.env.MLE_API_USER,
        email: process.env.MLE_API_EMAIL,
        password: process.env.MLE_API_PASS,
        hash: process.env.MLE_API_HASH,
        salt: process.env.MLE_API_SALT,
        role_id: 5
    }

    mocha.describe(`Test ${modelLabel} CRUD`, () => {

        mocha.it('Authenticate admin', async () => {
            await server
                .post(`${BASE_URL}login`)
                .set('Accept', 'application/json')
                .send({
                    email: admin.email,
                    password: admin.password
                })
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.message.type).to.equal('success');
                    expect(res.body.message.msg).to.equal('Login successful!');
                })
        });

        /**
         * Create new mock item.
         * @private
         */

        let item = mockItems[modelName];

        mocha.it(`Create new ${modelLabel}`, async () => {
            await server
                .post(`${BASE_URL}${modelRoute}/add`)
                .set('content-type', 'multipart/form-data')
                .field('nodes_id', item.nodes_id)
                .field('owner_id', item.owner_id)
                .attach('image1', fs.readFileSync(imgFiles[0]))
                .attach('image2', fs.readFileSync(imgFiles[1]))
                .attach('image3', fs.readFileSync(imgFiles[2]))
                .attach('image4', fs.readFileSync(imgFiles[3]))
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal(`Added item to ${modelLabel}.`);
                    item.nodes_id = res.body.data.nodes_id;
                })
        });

        /**
         * Show item data.
         * @private
         */

        mocha.it('Show item data', async () => {
            await server
                .get(`${BASE_URL}${modelRoute}/${item.nodes_id}`)
                .set('Accept', 'application/json')
                .then((res) => {
                    expect(res.status).to.equal(200);
                })
        });

        /**
         * Update item data.
         * @private
         */

        mocha.it('Update item data', async () => {
            await server
                .post(`${BASE_URL}${modelRoute}/${item.nodes_id}/edit`)
                .set('Accept', 'application/json')
                .send(item)
                .then((res) => {
                    expect(res.status).to.equal(200);
                })
        });

        /**
         * Delete new item.
         * @private
         */

        mocha.it('Delete created item', async () => {
            await server
                .post(`${BASE_URL}${modelRoute}/${item.nodes_id}/remove`)
                .set('Accept', 'application/json')
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal('MetadataView successfully deleted.');
                })
        });

    });

    /**
     * Sign-out administrator.
     * @private
     */

    mocha.describe('LogoutUser Administrator', () => {
        mocha.it('Sign out admin', async () => {
            await server
                .get(`${BASE_URL}logout`)
                .set('Accept', 'application/json')
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal('Successfully logged out!');
                })
        });
    });

})


