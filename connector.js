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
        var request = {
            resolveOk: function (payload, contentType) {
                return resolve({
                    status: 200,
                    payload: payload,
                    contentType: contentType
                });
            },
            resolveError: function (status, message) {
                return resolve({
                    status: status,
                    payload: message,
                    contentType: 'text/plain'
                });
            }
        }

        connectorChannel.checkExchange(rpc.requestExchange)
            .then(function () {
                return connectorChannel.checkExchange(rpc.responseExchange)
                    .then(function () {
                        return connectorChannel.bindQueue(connectorQueue, rpc.responseExchange, connectorQueue)
                            .then(function () {
                                return publishRequest(rpc, timestamp, request);
                            })
                            .catch(function (err) {
                                winston.error('Bind error: %s', err);
                                request.resolveError(500, 'Failed to bind to "' + rpc.responseExchange + '"');
                            })
                    })
                    .catch(function () {
                        request.resolveError(404, 'Exchange "' + rpc.responseExchange + '" does not exist');
                    });
            })
            .catch(function (err) {
                request.resolveError(404, 'Exchange "' + rpc.requestExchange + '" does not exist');
            });
    });
}

function publishRequest(rpc, timestamp, request) {
    var correlationId = uuid.v4();
    connectorRequests[correlationId] = request
    setTimeout(function () {
        request.resolveError(504, 'Request timed out');
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

    ch.on('return', handleReturn);

    winston.debug('Created channel, reason: %s', reason);
    connectorChannel = ch;

    return ch.consume(queue, handleResponse, {noAck: true});
}

function handleResponse(msg) {
    var request = connectorRequests[msg.properties.correlationId];
    if (request) {
        request.resolveOk(msg.content, msg.contentType);
        delete connectorRequests[msg.properties.correlationId];
    }
}

function handleReturn(msg) {
    var request = connectorRequests[msg.properties.correlationId];
    if (request) {
        request.resolveError(404, 'Request not routed');

        delete connectorRequests[msg.properties.correlationId];
    }
}

function die() {
    if (arguments.length > 1) {
        winston.error(arguments);
    } else if (arguments.length == 1) {
        winston.error(arguments[0]);
    }

    if (connectorConnection) {
        connectorConnection.close().then(function () {
            process.exit(123);
        }).catch(function (err) {
            winston.error('Connection close error: %s', err);
            process.exit(126);
        });
    }
}

module.exports = {
    connect: connect,
    call: call
};
