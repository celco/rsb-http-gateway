'use strict';

var amqp = require('amqplib');
var winston = require('winston');
var uuid = require('node-uuid');

var connectorLogin;
var connectorConnection;
var connectorChannel;
var connectorQueue;
var connectorRequests = {};

function connect(params) {
    var connString = 'amqp://' +
        encodeURIComponent(params.login) + ':' + encodeURIComponent(params.password) + '@' +
        encodeURIComponent(params.hostname) + ':' + params.port + '/' +
        encodeURIComponent(params.vhost) +
        '?heartbeat=' + encodeURIComponent(params.heartbeat);

    connectorLogin = params.login;

    var channel;
    return amqp.connect(connString).then(function (conn) {
        process.once('SIGINT', function () {
            conn.close().then(function () {
                die('Interrupted');
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
        return prepareChannel(channel, q.queue, 'New connection');
    }, die);
}

function call(rpc) {
    var timestamp = new Date().getTime();
    return new Promise(function (resolve, reject) {
        function resolveError(status, message) {
            resolve({
                status: status,
                payload: message,
                contentType: 'text/plain'
            });
        }

        connectorChannel.checkExchange(rpc.requestExchange)
            .then(function () {
                return connectorChannel.checkExchange(rpc.responseExchange)
                    .then(function () {
                        return connectorChannel.bindQueue(connectorQueue, rpc.responseExchange, connectorQueue)
                            .then(function () {
                                return publishRequest(rpc, timestamp, resolve);
                            })
                            .catch(function (err) {
                                winston.error('Bind error: %s', err);
                                resolveError(500, 'Failed to bind to "' + rpc.responseExchange + '"');
                            })
                    })
                    .catch(function () {
                        resolveError(404, 'Exchange "' + rpc.responseExchange + '" does not exist');
                    });
            })
            .catch(function (err) {
                resolveError(404, 'Exchange "' + rpc.requestExchange + '" does not exist');
            });
    });
}

function publishRequest(rpc, timestamp, resolve) {
    var correlationId = uuid.v4();
    connectorRequests[correlationId] = {
        resolve: resolve
    }

    setTimeout(function () {
        var request = connectorRequests[correlationId];
        if (request) {
            request.resolve({
                status: 504,
                payload: 'Request timed out',
                contentType: 'text/plain'
            });
        }
    }, rpc.timeout);

    return connectorChannel.publish(rpc.requestExchange, rpc.routingKey, rpc.body, {
        mandatory: true,
        replyTo: connectorQueue,
        correlationId: correlationId,
        contentType: rpc.contentType,
        timestamp: timestamp,
        type: rpc.requestExchange,
        userId: connectorLogin
    });
}


// TODO: handle channel.on('return', function (msg) {})

function prepareChannel(ch, queue, reason) {
    ch.on('error', function (error) {
        if (error.code == 404) {
            return connectorConnection.createChannel().then(function (ch) {
                return prepareChannel(ch, queue, error.message);
            }, die);
        } else {
            die(error);
        }
    });

    winston.debug('Created channel, reason: %s', reason);
    connectorChannel = ch;

    return ch.consume(queue, handleResponse, {noAck: true});
}

function handleResponse(msg) {
    var request = connectorRequests[msg.properties.correlationId];
    if (request) {
        request.resolve({
            status: 200,
            payload: msg.content,
            contentType: msg.contentType
        });

        delete connectorRequests[msg.properties.correlationId];
    }
}

function die() {
    if (arguments.length > 1) {
        winston.error(arguments);
    } else if (arguments.length == 1) {
        winston.error(arguments[0]);
    }

    connectorConnection.close().then(function () {
        process.exit(123);
    }).catch(function (err) {
        winston.error('Connection close error: %s', err);
        process.exit(126);
    });
}

module.exports = {
    connect: connect,
    call: call
};
