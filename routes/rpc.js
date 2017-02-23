'use strict';

var winston = require('winston');
var express = require('express');
var connector = require('../connector');

var router = express.Router();

/* POST RPC command */
router.post('/:command/:routing?', function(req, res) {
    if (req.params.routing) {
        winston.info("RPC - %s - %s", req.params.command, req.params.routing);
    } else {
        winston.info("RPC - %s", req.params.command);
    }

    var timeout = parseInt(req.query.timeout);
    if (isNaN(timeout)) {
        timeout = 20 * 1000;
    }

    connector.call({
        requestExchange: req.params.command + 'Request',
        responseExchange: req.params.command + 'Response',
        body: req.body || new Buffer(""),
        routingKey: req.params.routing || "",
        contentType: req.headers['content-type'] || 'application/json',
        timeout: timeout
    }).then(function (p) {
        res.status(p.status);
        res.set('Content-Type', p.contentType);
        res.send(p.payload);
    });
});

module.exports = router;
