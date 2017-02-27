'use strict';

var winston = require('winston');
var express = require('express');
var connector = require('../connector');

var router = express.Router();

/* POST RPC command */
router.post('/:command/:routing?', function(req, res) {
    var timeout = parseInt(req.query.timeout);
    if (isNaN(timeout)) {
        timeout = 20 * 1000;
    }

    connector.call({
        requestExchange: req.params.command + 'Request',
        responseExchange: req.params.command + 'Response',
        body: req.body || new Buffer(''),
        routingKey: req.params.routing || '',
        contentType: req.headers['content-type'] || 'application/json',
        timeout: timeout
    }).then(function (result) {
        logRequest(req, result);
        res.status(result.status);
        res.set('Content-Type', result.contentType);
        res.send(result.payload);
    }).catch(function (err) {
        winston.error('RPC - %s error: %s', req.params.command, err);
        res.status(500);
        res.set('Content-Type', 'text/plain');
        res.send('Unknown server error, check logs');
    });
});

function logRequest(req, result) {
    var id = 'RPC - ' + req.params.command;
    if (req.params.routing) {
        id += ' - ' + req.params.routing;
    }

    var level;
    switch (result.status) {
        case 504:
        case 404:
        case 400:
            level = 'warn';
            id += ' - ' + result.payload;
            break;
        case 200:
            level = 'info';
            break;
        default:
            level = 'error';
            break;
    }

    winston.log(level, '%d - %s', result.status, id);
}

module.exports = router;
