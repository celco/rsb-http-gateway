'use strict';

var express = require('express');

var router = express.Router();

/* GET health */
router.post('/', function(req, res) {
    res.send('OK');
});

module.exports = router;
