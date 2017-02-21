'use strict';

var express = require('express');
var path = require('path');
var winston = require('winston');
var nconf = require('nconf');
var bodyParser = require('body-parser');

var routes = require('./routes');

winston.addColors({
    silly: 'magenta',
    debug: 'blue',
    verbose: 'cyan',
    info: 'green',
    warn: 'yellow',
    error: 'red'
});

winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
    level: 'silly',
    prettyPrint: true,
    colorize: true,
    silent: false,
    timestamp: true
});

nconf.env()
    .file({ file: process.env['CONFIG_FILE'] || 'config.json'})
    .defaults({
        listenPort: process.env['LISTEN_PORT'] || 8080,
        logLevel: 'info',
        rpcTimeout: 20 * 1000, // milliseconds
        rabbitmq: {
            hostname: "localhost",
            port: 5672,
            login: "guest",
            password: "guest",
            vhost: "/",
            heartbeat: 30
        }
    });

winston.level = nconf.get('logLevel');
winston.info('Using RabbitMQ on host %s', nconf.get('rabbitMqHost'))

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/', routes);

//var rabbitParams = nconf.get('rabbitmq');
//connector.connect(rabbitParams, function() {
var server = app.listen(nconf.get('listenPort'), 'localhost', function () {
    var host = server.address().address;
    var port = server.address().port;

    winston.info('Accepting connections on http://%s:%s', host, port);
});
//});
