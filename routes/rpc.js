'use strict';

var express = require('express');
var connector = require('../connector');

var router = express.Router();

/* POST RPC command */
router.post('/:command/:routing?', function(req, res) {
    connector.call({
        requestExchange: req.params.command + 'Request',
        responseExchange: req.params.command + 'Response',
        body: req.body || new Buffer(""),
        routingKey: req.params.routing || "",
        contentType: req.headers['content-type'] || 'application/json',
        timeout: req.query.timeout || 20 * 1000
    });

    res.send('OK');
});

module.exports = router;
