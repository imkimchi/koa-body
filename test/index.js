/*!
 * koa-body <https://github.com/dlau/koa-body>
 * A koa body parser middleware with support for `multipart/form-data`,
 * `application/json` or `application/x-www-form-urlencoded` request bodies.
 *
 * Copyright (c) 2014 Charlike Mike Reagent, Daryl Lau, contributors.
 * Released under the MIT license.
 */

'use strict';

const _ = require('lodash');
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const koaBody = require('../index');
const path = require('path');
const request = require('supertest');
const should = require('should');
const Koa = require('koa');
const Router = require('koa-router');

describe('koa-body', () => {
  let database;
  let router;
  let app;

  beforeEach((done) => {
    app = new Koa();
    database = {
      "users": [
        {
          name: 'charlike',
          followers: 10
        },
        {
          name: 'tunnckocore',
          followers: 20
        }
      ]
    };
    router = Router()
      .get('/users', (ctx, next) => {
        if(ctx.request.body && ctx.request.body.name) {
          ctx.body = _.findWhere(database.users, { name: ctx.request.body.name });
          ctx.status = 200;
          return next();
        }
        ctx.status = 200;
        ctx.body = database;
      })
      .get('/users/:user', (ctx, next) => {
        user = _.findWhere(database.users, { name: ctx.request.body.name });
        ctx.status = 200;
        ctx.body = user;
      })
      .post('/users', (ctx, next) => {
        const user = ctx.request.body.fields || ctx.request.body;

        if(!user) {
          ctx.status = 400;
          return next();
        }
        database.users.push(user);
        ctx.status = 201;

        if(ctx.request.files) {
          ctx.body = ctx.request.files
        } else {
          ctx.body = ctx.request.body
        }
      })
      .delete('/users/:user', (ctx, next) => {
        const user = ctx.params.user;
        const multi = !!ctx.request.body.multi;
        if (multi) {
          database.users = database.users.filter( (element) => {
            return element.name !== user;
          });
        }
        else {
          const index = _.findIndex(database.users, { name: user });
          database.users.splice(index, 1);
        }
        ctx.status = 204;
        ctx.body = '';
      });
    done();
  });


  /**
   * DEFAULTS - multipart: false
   */
  it('should work with defaults - multipart: false, only `urlencoded` and `json` bodies',  (done) => {
    app.use(koaBody());
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .get('/users')
      .expect(200, database)
      .end( (err, res) => {
        if (err) return done(err);
        done();
      });
  });


  /**
   * MULTIPART - FIELDS
   */
  it('should receive `multipart` requests - fields on .body.fields object',  (done) => {
    app.use(koaBody({ multipart: true }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .field('name', 'daryl')
      .field('followers', 30)
      .expect(201)
      .end( (err, res) => {
        if (err) return done(err);

        var mostRecentUser = _.last(database.users);

        res.body.fields.should.have.property('name', mostRecentUser.name);
        res.body.fields.should.have.property('followers', mostRecentUser.followers);

        res.body.fields.name.should.equal('daryl');
        res.body.fields.followers.should.equal('30');

        res.body.fields.should.have.property('name', 'daryl');
        res.body.fields.should.have.property('followers', '30');

        done();
      });
  });


  /**
   * MULTIPART - FILES
   */
  it('should receive multiple fields and files via `multipart` on .body.files object',  (done) => {
    app.use(koaBody({
      multipart: true,
      formidable: {
        uploadDir: __dirname + '/temp'
      }
    }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('multipart/form-data')
      .field('names', 'John')
      .field('names', 'Paul')
      .attach('firstField', 'package.json')
      .attach('secondField', 'index.js')
      .attach('secondField', 'package.json')
      .attach('thirdField', 'LICENSE')
      .attach('thirdField', 'README.md')
      .attach('thirdField', 'package.json')
      .expect(201)
      .end( (err, res) => {
        if (err) return done(err);
        res.body.fields.names.should.be.an.Array().and.have.lengthOf(2);
        res.body.fields.names[0].should.equal('John');
        res.body.fields.names[1].should.equal('Paul');
        res.body.files.firstField.should.be.an.Object;
        res.body.files.firstField.name.should.equal('package.json');
        should(fs.statSync(res.body.files.firstField.path)).be.ok;
        fs.unlinkSync(res.body.files.firstField.path);

        res.body.files.secondField.should.be.an.Array().and.have.lengthOf(2);
        res.body.files.secondField.should.containDeep([{
          name: 'index.js'
        }]);
        res.body.files.secondField.should.containDeep([{
          name: 'package.json'
        }]);
        should(fs.statSync(res.body.files.secondField[0].path)).be.ok;
        should(fs.statSync(res.body.files.secondField[1].path)).be.ok;
        fs.unlinkSync(res.body.files.secondField[0].path);
        fs.unlinkSync(res.body.files.secondField[1].path);

        res.body.files.thirdField.should.be.an.Array().and.have.lengthOf(3);

        res.body.files.thirdField.should.containDeep([{
          name: 'LICENSE'
        }]);
        res.body.files.thirdField.should.containDeep([{
          name: 'README.md'
        }]);
        res.body.files.thirdField.should.containDeep([{
          name: 'package.json'
        }]);
        should(fs.statSync(res.body.files.thirdField[0].path)).be.ok;
        fs.unlinkSync(res.body.files.thirdField[0].path);
        should(fs.statSync(res.body.files.thirdField[1].path)).be.ok;
        fs.unlinkSync(res.body.files.thirdField[1].path);
        should(fs.statSync(res.body.files.thirdField[2].path)).be.ok;
        fs.unlinkSync(res.body.files.thirdField[2].path);

        done();
      });
  });

  it('can transform file names in multipart requests',  (done) => {
    app.use(koaBody({
      multipart: true,
      formidable: {
        uploadDir: __dirname + '/temp',
        onFileBegin:  (name, file) => {
          file.name = 'backage.json'
          const folder = path.dirname(file.path);
          file.path = path.join(folder, file.name);
        }
      }
    }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('multipart/form-data')
      .field('names', 'John')
      .field('names', 'Paul')
      .attach('firstField', 'package.json')
      .expect(201)
      .end( (err, res) => {
        if (err) return done(err);

        res.body.files.firstField.should.be.an.Object;
        res.body.files.firstField.name.should.equal('backage.json');
        should(fs.statSync(res.body.files.firstField.path)).be.ok;
        fs.unlinkSync(res.body.files.firstField.path);

        done();
      });
  });


  /**
   * URLENCODED request body
   */
  it('should recieve `urlencoded` request bodies',  (done) => {
    app.use(koaBody({ multipart: true }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('application/x-www-form-urlencoded')
      .send({
        name: 'example',
        followers: '41'
      })
      .expect(201)
      .end( (err, res) => {
        if (err) return done(err);
        const mostRecentUser = _.last(database.users);
        res.body.should.have.property('name', mostRecentUser.name);
        res.body.should.have.property('followers', mostRecentUser.followers);

        res.body.name.should.equal('example');
        res.body.followers.should.equal('41');

        res.body.should.have.property('name', 'example');
        res.body.should.have.property('followers', '41');

        done();
      });
  });


  /**
   * TEXT request body
   */
  it('should recieve `text` request bodies',  (done) => {
    app.use(koaBody({ multipart: true }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('text')
      .send('plain text')
      .expect(201)
      .end( (err, res) => {
        if (err) return done(err);

        const mostRecentUser = _.last(database.users);
        res.text.should.equal(mostRecentUser);

        done();
      });
  });

  describe('strict mode',  (done) => {
    beforeEach( () => {
      //push an additional, to test the multi query
      database.users.push({ name: 'charlike' });
    });

    it('can enable strict mode',  (done) => {
      app.use(koaBody({ strict: true }));
      app.use(router.routes());

      request(http.createServer(app.callback()))
        .delete('/users/charlike')
        .type('application/x-www-form-urlencoded')
        .send({ multi: true })
        .expect(204)
        .end( (err, res) => {
          if (err) return done(err);
          assert(_.findWhere(database.users, { name: 'charlike' }) !== undefined);
          done();
        });
    });

    it('can disable strict mode',  (done) => {
      app.use(koaBody({ strict: false }));
      app.use(router.routes());

      request(http.createServer(app.callback()))
        .delete('/users/charlike')
        .type('application/x-www-form-urlencoded')
        .send({ multi: true })
        .expect(204)
        .end( (err, res) => {
          if (err) return done(err);
          assert(_.findWhere(database.users, { name: 'charlike' }) === undefined);
          done();
        });
    });

  });
  /**
   * JSON request body
   */
  describe('POST json request body',  (done) => {

    it('should set the follower count',  () => {
      app.use(koaBody({ strict: false }));
      app.use(router.routes());
      let response = null;

      request(http.createServer(app.callback()))
        .post('/users')
        .type('application/json')
        .send({
          name: 'json',
          followers: '313'
        })
        .expect(201)
        .end((err, res) => {
          const mostRecentUser = _.last(database.users);
          res.body.should.have.property('name', mostRecentUser.name);
          res.body.name.should.equal('json');
          done(err);
        });
    });
  });

  describe('GET json request body', (done) => {
    let response;

    beforeEach((done) => {
      app.use(koaBody({ strict: false }));
      app.use(router.routes());
      database.users.push({
        name: 'foo',
        followers: 111
      });
      request(http.createServer(app.callback()))
        .get('/users')
        .type('application/json')
        .send({ name: 'foo' })
        .expect(200)
        .end( (err, res) => {
          response = res;
          done(err);
        })
    });

    it('should parse the response body',  () => {
      response.body.should.not.equal(null);
    });

    it('should return the user details',  () => {
      response.body.name.should.equal('foo');
      response.body.followers.should.equal(111);
    });
  });

  const ERR_413_STATUSTEXT = 'request entity too large';

  /**
   * FORM (urlencoded) LIMIT
   */
  it('should request 413 '+ERR_413_STATUSTEXT+', because of `formLimit`',  (done) => {
    app.use(koaBody({ formLimit: 10 /*bytes*/ }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('application/x-www-form-urlencoded')
      .send('user=www-form-urlencoded')
      .expect(413, ERR_413_STATUSTEXT)
      .end(done);
  });


  /**
   * JSON LIMIT
   */
  it('should request 413 '+ERR_413_STATUSTEXT+', because of `jsonLimit`',  (done) => {
    app.use(koaBody({ jsonLimit: 10 /*bytes*/ }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('application/json')
      .send({ name: 'some-long-name-for-limit' })
      .expect(413, ERR_413_STATUSTEXT)
      .end(done);
  });


  it('should tolerate no content type',  (done) => {
    app.use(koaBody());
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .send('Hello <b>invalid</b> content type')
      .expect(201)
      .end(done);
  });


  /**
   * TEXT LIMIT
   */
  it('should request 413 '+ERR_413_STATUSTEXT+', because of `textLimit`',  (done) =>  {
    app.use(koaBody({ textLimit: 10 /*bytes*/ }));
    app.use(router.routes());

    request(http.createServer(app.callback()))
      .post('/users')
      .type('text')
      .send('String longer than 10 bytes...')
      .expect(413, ERR_413_STATUSTEXT)
      .end(done);
  });
});
