/*!
 * MLP.API.Tests.Uploads
 * File: uploads.test.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

import { server, BASE_URL, compare } from './setup.js';
import {errors} from '../src/error.js';
import mocha from 'mocha';
import { expect } from 'chai';
import { humanize, toSnake } from '../src/lib/data.utils.js';
import * as db from '../src/services/index.services.js';

/**
 * Create mock file data.
 * @private
 */

let mockOwners = {
    historicImages: {

    }
};

let mockItems = {
    historicImages: {
        files_id: null,
        owner_id: 9825,
        filename: 'IDENTIFIER',
        file_size: 5566,
        x: 1200,
        y: 1600,
        image_state: 'master',
        remote: 'IDENTIFIER',
        secure_token: 'IDENTIFIER',
        comments: 'TEXT',
        filename_tmp: 'IDENTIFIER'
    },
    modernImages: {
        files_id: null,
        owner_id: 28383,
        filename: 'IDENTIFIER',
        file_size: 5566,
        x: 1200,
        y: 1600,
        image_state: 'master',
        remote: 'IDENTIFIER',
        secure_token: 'IDENTIFIER',
        comments: 'TEXT',
        filename_tmp: 'IDENTIFIER'
    },
    supplementalImages: {
        files_id: null,
        owner_id: 7843,
        image_type: 'location',
        filename: 'LC2_DSCF0342_011f9804-7099-11e2-a556-c82a14fffed2.JPG',
        file_size: 78994,
        x: 899,
        y: 899,
        bit_depth: 8,
        remote: 'REMOTE INFO',
        secure_token: 'SECURE TOKEN ***&&&',
        comments: 'COMMENTS TEXT',
        lat: 100.1,
        long: 100.1,
        elev: 3455,
        azim: 100.1,
        f_stop: 10,
        shutter_speed: 0.4,
        iso: 100,
        focal_length: 120,
        capture_datetime: '2014-07-09 16:49:00.572006',
        cameras_id: 9,
        lens_id: null,
        filename_tmp: 'TEMP FILENAME'
    }
}

let imgFiles = [
    '/Users/boutrous/Workspace/NodeJS/images/historic/hi-0027.tif',
    '/Users/boutrous/Workspace/NodeJS/images/modern/ri-0031.tif',
    '/Users/boutrous/Workspace/NodeJS/images/uploads/BRI1917_B-21-17.tif',
    '/Users/boutrous/Workspace/NodeJS/images/uploads/HB2_A0006431.3FR'
];

// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 2.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 3.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 4.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 5.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 6.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 7.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy 8.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031 copy.tif
// /Users/boutrous/Workspace/NodeJS/images/modern/ri-0031.tif


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

            await server
                .get(`${BASE_URL}${modelRoute}/${testItem.files_id}`)
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
        user_id: process.env.API_USER,
        email: process.env.API_EMAIL,
        password: process.env.API_PASS,
        hash: process.env.API_HASH,
        salt: process.env.API_SALT,
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

        mocha.it(`Upload new ${modelLabel}`, async () => {
            await server
                .post(`${BASE_URL}${modelRoute}/upload`)
                .set('Accept', 'application/json')
                .send({
                    metadata: item,
                    files: imgFiles
                })
                .then((res) => {
                    expect(res).to.have.status(200);
                    expect(res.body.messages[0].type).to.equal('success');
                    expect(res.body.messages[0].string).to.equal(`Added item to ${modelLabel}.`);
                    item.files_id = res.body.item.files_id;
                })
        });

        /**
         * Show item data.
         * @private
         */

        mocha.it('Show item data', async () => {

            console.log('!!!! ---> !!!', item)
            await server
                .get(`${BASE_URL}${modelRoute}/${item.files_id}`)
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
                .post(`${BASE_URL}${modelRoute}/${item.files_id}/edit`)
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
                .post(`${BASE_URL}${modelRoute}/${item.files_id}/remove`)
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


/**
 * Test uploader.
 * @private
 */

mocha.describe('Upload controller', () => {

    /**
     * Upload multiple images
     * @private
     */

    mocha.it('Upload multiple images', async () => {
        await server
            .post(`${BASE_URL}upload`)
            .set('Accept', 'application/json')
            .send({
                files: imgFiles
            })
            .then((res) => {
                console.log(res.body.files)
                expect(res).to.have.status(200);
                expect(res.body.messages[0].type).to.equal('success');
                expect(res.body.messages[0].string).to.equal(`Upload successful!`);
            })
    });
});
