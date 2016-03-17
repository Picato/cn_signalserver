/**
 * Handle all in-coming call & chat
 */
var uuid = require('node-uuid'),
  crypto = require('crypto'),
  ArrayList = new require('arraylist'),
  MSGTYPE = require('./msgtype'),
  logger = require('winston');

function CallManager(io, config) {
  this.io = io;
  this.config = config;

  //store all operator socket.id
  this.listOperator = new ArrayList();
}

/**
 * @param client: socket client
 * @description: handle all message here
 */
CallManager.prototype.handleClient = function(client) {
  var self = this;
  client.resources = { screen: false, video: true, audio: false };

  //ringing message
  client.on(MSGTYPE.RINGING, function (message) {
    var rec = self.io.to(message.to);

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  // pass a message to another id
  client.on(MSGTYPE.MESSAGE, function (details) {
    logger.info('on message', details);
    if (!details) return;

    var otherClient = self.io.to(details.to);
    if (!otherClient) return;

    details.from = client.id;
    otherClient.emit('message', details);
  });

  //share screen
  client.on(MSGTYPE.SHARESCREEN, function () {
    client.resources.screen = true;
  });

  client.on(MSGTYPE.UNSHARESCREEN, function () {
    client.resources.screen = false;
    removeFeed('screen');
  });

  client.on('join', join);

  function removeFeed(type) {
    if (client.room) {
      io.sockets.in(client.room).emit('remove', {
        id: client.id,
        type: type
      });
      if (!type) {
        client.leave(client.room);
        client.room = undefined;
      }
    }
  }

  function join(name, cb) {
    // sanity check
    if (typeof name !== 'string')
      return;

    cb = (typeof cb == 'function') ? cb : function () {};

    // check if maximum number of clients reached
    if (this.config.rooms && this.config.rooms.maxClients > 0 &&
      io.sockets.clients(name).length >= this.config.rooms.maxClients) {
      cb('full');
      return;
    }

    // leave any existing rooms
    removeFeed();
    cb(null, describeRoom(name));
    client.join(name);
    client.room = name;
  }

  // we don't want to pass "leave" directly because the
  // event type string of "socket end" gets passed too.
  client.on(MSGTYPE.DISCONNECT, function () {
    removeFeed();

    //TODO if operator, remove from list operator
  });

  client.on(MSGTYPE.LEAVE, function () {
    removeFeed();
  });

  client.on('create', function (name, cb) {
    if (arguments.length == 2) {
      name = name || uuid();
    } else {
      name = uuid();
    }
    cb = (typeof cb == 'function') ? cb : function () {};

    // check if exists
    var room = this.io.nsps['/'].adapter.rooms[name];
    if (room && room.length) {
      cb('taken');
    } else {
      join(name);
      cb(null, name);
    }
  });

  // support for logging full webrtc traces to std-out
  // useful for large-scale error monitoring
  client.on('trace', function (data) {
    console.log('trace', JSON.stringify(
      [data.type, data.session, data.prefix, data.peer, data.time, data.value]
    ));
  });

  function describeRoom(name) {
    var adapter = io.nsps['/'].adapter;
    var clients = adapter.rooms[name] || {};
    var result = {
      clients: {}
    };
    Object.keys(clients).forEach(function (id) {
      result.clients[id] = adapter.nsp.connected[id].resources;
    });
    return result;
  }
}

/**
 * @param operatorId
 * @param socketId: socket id of operator
 */
CallManager.prototype.addOperator = function(operatorId, socketId) {
  logger.info('an operator join');
  //add operator to list
  this.listOperator.set(operatorId, socketId);
}

/**
 * @param vSocketId: visitor socket id
 * @param operatorId: target call/chat
 * @param msgType: chat/call
 */
CallManager.prototype.invOperator = function(vSocket, operatorId, msgType) {
  logger.info('receive visitor connect', msgType);
  var operatorSocket = this.listOperator.get(operatorId);
  logger.info('invOperator - get operatorSocketId', operatorSocket);
  if (!operatorSocket) return;

  var oprSocket = this.io.to(operatorSocket);
  if (!oprSocket) return;
  logger.info('invOperator - get operatorSocket');

  switch(msgType) {
    case MSGTYPE.INVITE_CALL:
      logger.info('invite call');
      //send invite to operator
      //TODO more info will be sent to callee
      oprSocket.emit(MSGTYPE.INVITE_CALL, {
        from: vSocket.id,
        to: operatorSocket
      });
      break;
    case MSGTYPE.INVITE_CHAT:
      logger.info('invite chat');
      //send invite chat
      oprSocket.emit(MSGTYPE.INVITE_CHAT, {
        from: vSocket.id,
        to: operatorSocket/*more info*/
      });
      break;
  }

  //send trying back to visitor
  vSocket.emit(MSGTYPE.TRYING100, {});
}

/**
 * Inform client STUN/TURN's sever information
 * @param client: client socket
 * @param config: configuration of stun & server
 */
CallManager.prototype.sendServerInfoToClient = function(client, config) {
  // tell client about stun servers
  client.emit(MSGTYPE.STUNSERVER, config.stunservers || []);

  // create shared secret nonces for TURN authentication
  // the process is described in draft-uberti-behave-turn-rest
  var credentials = [];

  // allow selectively vending turn credentials based on origin.
  var origin = client.handshake.headers.origin;
  if (!config.turnorigins || config.turnorigins.indexOf(origin) !== -1) {
    config.turnservers.forEach(function (server) {
      var hmac = crypto.createHmac('sha1', server.secret);
      // default to 86400 seconds timeout unless specified
      var username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + "";
      hmac.update(username);
      credentials.push({
        username: username,
        credential: hmac.digest('base64'),
        urls: server.urls || server.url
      });
    });
  }

  // tell client about turn servers
  client.emit(MSGTYPE.TURNSERVER, credentials);
}

module.exports = CallManager;
