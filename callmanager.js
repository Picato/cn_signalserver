/**
 * Handle all in-coming call & chat
 */
var uuid = require('node-uuid'),
  crypto = require('crypto'),
  Hashtable = new require('hashtable')(),
  msgtype = require('./msgtype');

function CallManager(io, config) {
  this.io = io;
  this.config = config;

  //store all operator socket.id
  this.listOperator = new Hashtable();
}

/**
 * @param client: socket client
 * @description: handle all message here
 */
CallManager.prototype.handleClient = function(client) {
  client.resources = {
    screen: false,
    video: true,
    audio: false
  };

  //ringing message
  client.on('ringing', function (message) {
    var rec = io.to(message.id);
    rec.emit('ringing', "message");
  });

  // pass a message to another id
  client.on('message', function (details) {
    console.log('on message', details);
    if (!details) return;

    var otherClient = io.to(details.to);
    if (!otherClient) return;

    details.from = client.id;
    otherClient.emit('message', details);
  });

  client.on('shareScreen', function () {
    client.resources.screen = true;
  });

  client.on('unshareScreen', function (type) {
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
      clientsInRoom(name) >= this.config.rooms.maxClients) {
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
  client.on('disconnect', function () {
    removeFeed();
  });
  client.on('leave', function () {
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

  // tell client about stun and turn servers and generate nonces
  client.emit('stunservers', config.stunservers || []);

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
  client.emit('turnservers', credentials);

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

  function clientsInRoom(name) {
    return io.sockets.clients(name).length;
  }
}

/**
 * @param operatorId
 * @param socketId: socket id of operator
 */
CallManager.prototype.addOperator = function(operatorId, socketId) {
  this.listOperator.put(operatorId, socketId);
}

/**
 * @param vSocketId: visitor socket id
 * @param operatorId: target call/chat
 * @param msgType: chat/call
 */
CallManager.prototype.invOperator = function(vSocketId, operatorId, msgType) {
  var operatorSocket = this.listOperator.get(operatorId);

  switch(msgType) {
    case msgtype.INVITE_CALL:
      //send invite to operator
      operatorSocket.emit(this.msg, {});
      break;
    case msgtype.INVITE_CHAT:
      //create room
      break;
  }
}

module.exports = CallManager;