/*!
 * MLP.API.Tests.Models
 * File: users.test.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */


import { server, BASE_URL } from './setup.js';
import {errors} from '../src/error.js';
import mocha from 'mocha';
import { expect } from 'chai';
import * as db from '../src/services/index.services.js';
import { humanize, toSnake } from '../src/lib/data.utils.js';

/**
 * Create mock items.
 * @private
 */

let mockItems = {
    metadataFiles:{
        id: null,
        owner_id: 9825,
        type: 'field_notes',
        remote: 'IDENTIFIER',
        secure_token: 'IDENTIFIER',
        comments: 'TEXT',
        filename_tmp: 'IDENTIFIER'
    },
    glassPlateListings: {
        id: null,
        owner_id: 9825,
        container: 'IDENTIFIER',
        plates: 'IDENTIFIER',
        notes: 'IDENTIFIER',
    },
    maps: {
        id: null,
        owner_id: 9825,
        container: 'IDENTIFIER',
        plates: 'IDENTIFIER',
        notes: 'IDENTIFIER',
    },
    cameras: {
        id: null,
        make: 'IDENTIFIER',
        model: 'IDENTIFIER',
        unit: 'IDENTIFIER',
        format: 'IDENTIFIER'
    },
    lens: {
        id: null,
        brand: "IDENTIFIER",
        focal_length: "IDENTIFIER",
        max_aperture: "IDENTIFIER"
    }
}

// enumerated types
const imageTypes = ['location', 'scenic'];
const imageStates = ['raw', 'master', 'interim', 'misc', 'gridded'];


/**
 * Compares output data to model schema
 * @param {Model} model
 * @param {Array} data
 * @private
 */

function compare(model, data) {
    data.forEach((item) => {
        // go through model properties
        Object.entries(model.attributes)
            .forEach(([field, _]) => {
                expect(item).to.have.property(field);
            });
    });
}

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
                    testItem = res.body.item[0];
                    expect(res).to.have.status(200);
                    expect(res.body.item).to.instanceOf(Array);
                    compare(model, res.body.item);
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
            console.log('---->>', testItem)

            await server
                .get(`${BASE_URL}${modelRoute}/${testItem.id}`)
                .set('Accept', 'application/json')
                .then((res) => {
                    expect(res.status).to.equal(200);
                    compare(model, [res.body.item]);
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
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal('LoginUser successful.');
                })
        });

        /**
         * Get mock item.
         * @private
         */

        let item = mockItems[modelName];

        mocha.it(`Create new ${modelLabel}`, async () => {
            await server
                .post(`${BASE_URL}${modelRoute}/add`)
                .set('Accept', 'application/json')
                .send(item)
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal(`Added item to ${modelLabel}.`);
                    item.nodes_id = res.body.item.nodes_id;
                })
        });

        /**
         * Show item data.
         * @private
         */

        mocha.it('Show item data', async () => {

            console.log('!!!! ---> !!!', item)
            await server
                .get(`${BASE_URL}${modelRoute}/${item.id}`)
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
                .post(`${BASE_URL}${modelRoute}/${item.id}/edit`)
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
                .post(`${BASE_URL}${modelRoute}/${item.id}/remove`)
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


