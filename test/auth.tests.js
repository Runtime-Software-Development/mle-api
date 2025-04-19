/*!
 * MLP.API.Tests.Users
 * File: users.test.js
 * Copyright(c) 2024 Runtime Software Development Inc.
 * MIT Licensed
 * 
 * Description: Run all user unit tests (authentication required)
 * 
 * Revisisons
 * 2024-09-20: Initial release
 */

/**
 * Module dependencies.
 * @private
 */

import { app, BASE_URL } from './setup.js';
import { it, describe } from 'mocha';
import { expect } from 'chai';
import { errors } from '../src/error.js';
import path from 'path';
import request from 'supertest';

/**
 * Get admin user data.
 * */

let admin = {
    email: process.env.MLE_API_EMAIL,
    password: process.env.MLE_API_PASS,
    role: 'super_administrator'
}

// cookie to store user access and refresh tokens
let cookie;

/**
 * Sign-in administrator.
 * @private
 */


describe('Login Administrator', () => {
    it('Authenticate wrong email should fail', async () => {
        request(app)
        .post(path.join(BASE_URL, 'login'))
        .set('Accept', 'application/json')
        .send({
                email: 'wrong@example.ca',
                password: admin.password
            })
        .expect(422)
        .expect((res) => {
            expect(res.body.message.msg).to.equal(errors.invalidCredentials.msg)
        });
    });
        

    it('Authenticate wrong password should fail', async () => {
        request(app)
            .post(path.join(BASE_URL, 'login'))
            .set('Accept', 'application/json')
            .send({
                email: admin.email,
                password: 'WRONG5565lSSR!3323'
            })
            .expect(422)
            .expect((res) => {
                expect(res.body.message.msg).to.equal(errors.invalidCredentials.msg)
            });
    });

    it('Authenticate correct credentials', async () => {
        const res = await request(app)
            .post(path.join(BASE_URL, 'login'))
            .set('Accept', 'application/json')
            .send({
                email: admin.email,
                password: admin.password
            })
            .expect(200)
            .expect((res) => {
                expect(res.body.message.msg).to.equal('Login successful!')
            });

        // store access/refresh tokens
        cookie = res.headers["set-cookie"];

    });

    it('Redundant login', async () => {
        request(app)
            .post(path.join(BASE_URL, 'login'))
            .set('Accept', 'application/json')
            .set('Cookie', cookie)
            .send({
                email: admin.email,
                password: admin.password
            })
            .expect(422)
            .expect((res) => {
                expect(res.body.message.msg).to.equal(errors.redundantLogin.msg)
            });

    });

    it('Should refresh token', async () => {
        request(app)
            .post(path.join(BASE_URL, 'refresh'))
            .set('Accept', 'application/json')
            .set('Cookie', cookie)
            .expect(200)
            .expect((res) => {
                expect(res.body.message.msg).to.equal('Token refreshed.')
            });
    });

    it('Should logout user', async () => {
        request(app)
            .post(path.join(BASE_URL, 'logout'))
            .set('Accept', 'application/json')
            .set('Cookie', cookie[0])
            .expect(200)
            .expect((res) => {
                expect(res.body.message.msg).to.equal('Successfully logged out!')
            });
    });
});
