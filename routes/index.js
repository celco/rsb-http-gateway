'use strict';

var express = require('express');
var packageJson = require('../package.json');
var healthRoutes = require('./health');

var router = express.Router();

router.get('/', function(req, res) {
    res.send('RSB HTTP Gateway v' + packageJson.version);
});

router.use('/health', healthRoutes);

module.exports = router;
