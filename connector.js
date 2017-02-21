'use strict';

var amqp = require('amqplib');
var winston = require('winston');

var connectorChannel;
var connectorQueue;

function connect(params) {
    var connString = 'amqp://' +
        encodeURIComponent(params.login) + ':' + encodeURIComponent(params.password) + '@' +
        encodeURIComponent(params.hostname) + ':' + params.port + '/' +
        encodeURIComponent(params.vhost) +
        '?heartbeat=' + encodeURIComponent(params.heartbeat);

    return amqp.connect(connString).then(function (conn) {
        process.once('SIGINT', function () {
            conn.close().then(function () {
                die("Interrupted");
            });
        });
        return conn.createChannel();
    }, die).then(function (ch) {
        winston.info('Connected to RabbitMQ on %s:%d as %s',
                params.hostname, params.port, params.login);

        ch.on('error', die);
        connectorChannel = ch;
        return ch.assertQueue(null, {autoDelete: true, exclusive: true, durable: false});
    }, die).then(function (q) {
        winston.info('Using RabbitMQ queue: %s', q.queue);

        connectorQueue = q.queue;
        connectorChannel.consume(q.queue);
    }, die);
}

function die() {
    if (arguments.length > 1) {
        winston.error(arguments);
    } else if (arguments.length == 1) {
        winston.error(arguments[0]);
    }
    process.exit(123);
}

module.exports = {
    connect: connect
};
