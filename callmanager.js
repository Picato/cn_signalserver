/**
 * Handle all in-coming call & chat
 */
var uuid = require('node-uuid'),
  crypto = require('crypto'),
  UserManager = require('./usermanager');
  MSGTYPE = require('./msgtype'),
  logger = require('winston'),
  _ = require('lodash'),
  ConekLogger = require('./coneklogger');

function CallManager(io, config) {
  this.io = io;
  this.config = config;

  this.userManager = new UserManager();

  //init conek logger
  this.conekLogger = new ConekLogger(config.logapi);
}

/**
 * @param client: socket client
 * @description: handle all message here
 */
CallManager.prototype.handleClient = function (client) {
  var self = this;
  client.resources = {screen: false, video: true, audio: false};

  //invite message
  client.on(MSGTYPE.INVITE, function(message) {
    logger.info('invite msg--', message);

    var sSockets, rSockets, vid, oid;
    var cid = message.cid;
    if (message.to == 'o' && message.from == 'v') {    //v-->o
      logger.info('invite msg--rSocket');
      vid = message.fid; oid = message.tid;
      rSockets = self.userManager.getOperatorSockets(cid, oid);
      sSockets = self.userManager.getVisitorSockets(cid, vid);
    } else if (message.from == 'o' && message.to == 'v') { //o-->v
      vid = message.tid; oid = message.fid;

      rSockets = self.userManager.getVisitorSockets(cid, vid);
      sSockets = self.userManager.getOperatorSockets(cid, oid);
    } else {  //o --> o

    }

    if (sSockets && sSockets.length > 0 && rSockets && rSockets.length > 0) {
      var conek = message.conek;
      if (message.type == 'call') {
        message.fs = client.id;   //to send back ringing message
      }

      //invite message
      var socket;
      _.each(rSockets, function(s) {
        socket = self.io.sockets.connected[s];

        if (socket) {
          logger.info('send invite message');
          socket.join(conek);                //TODO check socket already in room
          socket.emit(MSGTYPE.INVITE, message);
        }
      });

      //sender socket join room
      if (!sSockets[0].rooms || sSockets[0].rooms.indexOf(conek) < 0) {
        logger.info('visitor join room');
        _.each(sSockets, function (s) {
          socket = self.io.sockets.connected[s];

          if (socket)
            socket.join(conek);
        });
      } else {
        logger.info('already room');
      }

      if (message.type == 'chat') {
        //send back accept msg
        client.emit(MSGTYPE.ACCEPT, {
          id: message.tid,
          conek: conek,
          type: 'chat'
        });

        //set conek
        self.userManager.setConek(cid, oid, vid, conek);
      }
    } else {//TODO handle no receiver sockets

    }
  });

  //ringing message
  client.on(MSGTYPE.RINGING, function (message) {
    var rec = self.io.sockets.connected[message.ts];

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var rec = self.io.sockets.connected[message.ts];

    logger.info('forward accept msg to', client.id);
    //forward accept message
    rec.emit(MSGTYPE.ACCEPT, {
      id: client.id,
      resource: client.resources,
      conek: message.conek,
      type: message.type
    });

    //join client socket to room
    rec.join(message.conek);
    client.join(message.conek);
  });

  //decline message
  client.on(MSGTYPE.DECLINE, function(message) {
    logger.info('decline msg', message);
    var rec = self.io.sockets.connected[message.to];

    //inform caller
    rec.emit(MSGTYPE.DECLINE, {type: message.type});

    //log miscall
    self.conekLogger.logmisscall(message);
  });

  // pass a message to another id
  client.on(MSGTYPE.MESSAGE, function (message) {
    logger.info('on message', message);
    if (!message || message.type != 'chat') return;

    var room = client.broadcast.to(message.conek);
    logger.info('broadcast to room - 0');
    if (room) {
      logger.info('broadcast to room');
      //emit to all sockets
      room.emit(MSGTYPE.MESSAGE, message);
      self.conekLogger.logchat(message);
    }
  });

  client.on(MSGTYPE.DISCONNECT, function() {
    logger.info('disconnect');
    self.userManager.clientDisconnect(client.id, function(err, obj) {
      if (err)
        return;
      //TODO handle operator/visitor offline

      logger.info('disconnect', obj.type);
    });
  });

  //pass sdp message
  client.on(MSGTYPE.SDP, function(message) {
    //forward message to receive
    var socket = self.io.sockets.connected[message.to];
    message.from = client.id;
    if (socket) {
      logger.info('forward message');
      socket.emit(MSGTYPE.SDP, message);
    }
  });

  //share screen
  client.on(MSGTYPE.SHARESCREEN, function () {
    client.resources.screen = true;
  });

  client.on(MSGTYPE.UNSHARESCREEN, function () {
    client.resources.screen = false;
  });

  client.on(MSGTYPE.UPDATEUSERID, function(details) {
    logger.info('update id', details);
    self.userManager.updateId(client.id, details.id);
  })
}

/**
 * @param id: socket id of operator/visitor
 * @param oid: operator id
 */
CallManager.prototype.addUser = function (socket, data) {
  var self = this;
  logger.info('join data', data);
  //add operator to list
  this.userManager.addUser(data.type, socket.id, data, function(err, coneks, details) {
    if (err) {
      //TODO handle add user's fail
      return;
    }

    //join room for new connections
    logger.info('find coneks', coneks);
    if (coneks) {
      console.log('inform coneks', coneks);
      _.each(coneks, function(conek) {
        socket.join(conek);
        socket.emit('conek', conek);
      });
      return;
    }

    if (!details) return;

    logger.info('find emit', details);

    //handle new operator joins
    if (data.type == 'operator') {
      //emit all oll visitors to operator
      var message = null, ret = [];
      _.each(details, function(detail) {
        message = detail;
        delete message.sockets;
        ret.push(message);
      });
      socket.emit(MSGTYPE.VISITORS, ret);
    } else { //handle new visitor joins
      logger.info('info visitor join', details);

      //remove unnecessary information
      delete data.cid;
      delete data.token;
      delete data.key;
      delete data.type;

      var sendSocket;
      _.each(details, function(o) { //each operator
        _.each(o.sockets, function(s) {
          sendSocket = self.io.sockets.connected[s];
          if (sendSocket) {
            sendSocket.emit(MSGTYPE.VISITOR_JOIN, data);
          }
        })
      });
    }
  });
}

/**
 * Inform client STUN/TURN's sever information
 * @param client: client socket
 * @param config: configuration of stun & server
 */
CallManager.prototype.sendServerInfoToClient = function (client, config) {
  // tell client about stun servers
  client.emit(MSGTYPE.STUNSERVER, config.stunservers || []);

  // create shared secret nonces for TURN authentication
  // the process is described in draft-uberti-behave-turn-rest
  var credentials = [];
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

  // tell client about turn servers
  client.emit(MSGTYPE.TURNSERVER, credentials);
}

module.exports = CallManager;
