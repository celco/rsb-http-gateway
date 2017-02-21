var express = require('express');
var pjson = require('../package.json');

var router = express.Router();

router.get('/', function(req, res) {
  res.send('RSB HTTP Gateway v' + pjson.version);
});

module.exports = router;
