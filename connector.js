'use strict';

var amqp = require('amqplib');
var winston = require('winston');
var uuid = require('node-uuid');

var connectorConnection;
var connectorChannel;
var connectorQueue;

function connect(params) {
    var connString = 'amqp://' +
        encodeURIComponent(params.login) + ':' + encodeURIComponent(params.password) + '@' +
        encodeURIComponent(params.hostname) + ':' + params.port + '/' +
        encodeURIComponent(params.vhost) +
        '?heartbeat=' + encodeURIComponent(params.heartbeat);

    var channel;
    return amqp.connect(connString).then(function (conn) {
        process.once('SIGINT', function () {
            conn.close().then(function () {
                die("Interrupted");
            });
        });

        connectorConnection = conn;
        return conn.createChannel();
    }, die).then(function (ch) {
        winston.info('Connected to RabbitMQ on %s:%d as %s',
                params.hostname, params.port, params.login);

        channel = ch;
        return ch.assertQueue(null, {exclusive: true, durable: false});
    }, die).then(function (q) {
        winston.info('Using RabbitMQ queue: %s', q.queue);

        connectorQueue = q.queue;
        prepareChannel(channel, q.queue, "New connection");
    }, die);
}

function call(rpc) {
    //rpc.requestExchange;
    //rpc.responseExchange;
    //rpc.body;
    //rpc.routingKey;
    //rpc.contentType;
    //rpc.timeout;

    Promise.all([
            connectorChannel.checkExchange(rpc.requestExchange),
            connectorChannel.checkExchange(rpc.responseExchange)
    ]).catch(handleRequestError);
}

function handleRequestError(err) {
    winston.warn(err.message);
}

function prepareChannel(ch, queue, reason) {
    ch.on('error', function (error) {
        if (error.code == 404) {
            return connectorConnection.createChannel().then(function (ch) {
                prepareChannel(ch, queue, error.message);
            }, die);
        } else {
            die(error);
        }
    });
    ch.consume(queue);
    connectorChannel = ch;

    winston.info('Created channel, reason: %s', reason);
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
    connect: connect,
    call: call
};
