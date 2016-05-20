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

    var sSockets, rSockets;
    if (message.to == 'o' && message.from == 'v') {    //v-->o
      logger.info('invite msg--rSocket');
      rSockets = self.userManager.getOperatorSockets(message.cid, message.tid);
      sSockets = self.userManager.getVisitorSockets(message.cid, message.fid);
    } else if (message.from == 'o' && message.to == 'v') { //o-->v
      rSockets = self.userManager.getVisitorSockets(message.cid, message.tid);
      sSockets = self.userManager.getOperatorSockets(message.cid, message.fid);
    } else {  //o --> o

    }

    logger.info('invite msg--rSocket', rSockets.length);
    if (sSockets && sSockets.length > 0
        && rSockets && rSockets.length > 0) {
      var conek = message.conek;
      if (message.type == 'chat') {
        //send back accept message
        client.emit(MSGTYPE.ACCEPT, {
          id: client.id,
          conek: conek,
          type: 'chat'
        });
      } else {   //call
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
    } else {    //TODO handle no receiver sockets

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
    if (room) {
      //emit to all sockets
      room.emit(MSGTYPE.MESSAGE, message);
      self.conekLogger.logchat(message);
    }
  });

  // pass sdp message
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
  //add operator to list
  this.userManager.addUser(data.type, socket, data, function(err, details) {
    if (err) {
      //TODO handle add user's fail
      return;
    }

    //handle operator joins
    if (data.type == 'operator') {

    } else { //handle visitor joins

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

/**
 * @type {CallManager}
 * handle client disconnect
 * @param id socket id
 */
CallManager.prototype.clientDisconnect = function(id) {
  var self = this;
  console.log('handle client disconnected', id);

  //remove user as socket id
  self.userManager.getPeers(id, function(err, type, user) {
    if (err) return;

    var socket;
    if (type == 'operator' || type == 'visitor') {
      //inform peer
      var peers = user.peers;

      _.each(peers, function(peer){
        socket = self.io.sockets.connected[peer];

        if (socket)
          socket.emit(MSGTYPE.LEAVE, {
            id: user.id
          });
      });

      //inform call
      if (!_.isEmpty(user.call)) {
        socket = self.io.sockets.connected[user.call.talks];
        if (socket)
          socket.emit(MSGTYPE.OWNERLEAVE, {
            id: id
          });

        socket = self.io.sockets.connected[user.call.peertalks];
        if (socket)
          socket.emit(MSGTYPE.OWNERLEAVE, {
            id: id
          });
      }

      //remote user
      self.userManager.removeUser(id, type);

      //inform visitor off
      if (type == 'visitor') {
        self.userManager.getOperatorsByCustomer(user.customer, function(err, operators){
          if (err)
            return;

          _.each(operators, function(operator) {
            socket = self.io.sockets.connected[operator.socket];
            if (socket)
              socket.emit(MSGTYPE.VISITOR_LEAVE);
          });
        });
      }
    }
    else {  //type = 'call'
      //inform owner
      socket = self.io.sockets.connected[user.socket];
      if (socket)
        socket.emit(MSGTYPE.CALLOFF, {
          id: user.call.id,
          conek: user.call.conek,
          time: user.call.time
        });

      //inform peer
      socket = self.io.sockets.connected[user.call.socket];
      if (socket)
        socket.emit(MSGTYPE.PEERCALLOFF, {
          id: user.id,
          conek: user.call.conek,
          time: user.call.time
        });

      //inform peer talk
      socket = self.io.sockets.connected[user.call.peertalks];
      if (socket)
        socket.emit(MSGTYPE.PEERCALLOFF, {
          conek: user.call.conek,
          time: user.call.time
        });

      self.userManager.removePeerCall(user, type);
    }
  });
}

module.exports = CallManager;
