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
      logger.info('invite msg-- v -> o');
      vid = message.fid; oid = message.tid;
      rSockets = self.userManager.getOperatorSockets(cid, oid);
      sSockets = self.userManager.getVisitorSockets(cid, vid);
    } else if (message.from == 'o' && message.to == 'v') { //o-->v
      logger.info('invite msg-- o -> v');
      vid = message.tid; oid = message.fid;

      rSockets = self.userManager.getVisitorSockets(cid, vid);
      sSockets = self.userManager.getOperatorSockets(cid, oid);
    } else if (message.from == 'o' && message.to == 's') { //o-->conek supporter
      oid = message.tid;
      rSockets = self.userManager.getOperatorSockets(cid, oid);

      sSockets = [];
      sSockets.push(client.id);
    } else {  //o --> o
      return;
    }

    if (sSockets && sSockets.length > 0 && rSockets && rSockets.length > 0) {
      var conek = message.conek;

      if (message.type == 'call') {
        message.fs = client.id;
        logger.info('invite call, handshake=', client.handshake.query);
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
    console.log('ringing msg', message);
    var rec = self.io.sockets.connected[message.ts];

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var rec = self.io.sockets.connected[message.ts];

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

    //log call
    var callId = uuid.v1();

    self.conekLogger.logchat({
      conek: message.conek,
      from: message.from,
      content: callId,
      type: 'call'
    });

    //set caller/callee
    var cid = message.cid;
    var oid, vid, osid, vsid;
    if (message.from == 'o') {
      oid = message.fid;
      vid = message.tid;
      osid = client.id;
      vsid = rec.id;
    } else {
      oid = message.tid;
      vid = message.fid;
      osid = rec.id;
      vsid = client.id;
    }

    self.userManager.setCallPeer(cid, oid, vid, osid, vsid, callId);
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
    var cid = client.handshake.query.cid;
    var vid = client.handshake.query.vid;
    var action = client.handshake.query.type;
    var conek = client.handshake.query.conek;
    logger.info('disconnect vid=', vid, '  cid=', cid, ' action=', action, ' conek=', conek);
    // broarcast
    var room = client.broadcast.to(conek);
    if (room) {
      logger.info('broadcast to room');
      room.emit(MSGTYPE.DECLINE, {cid: cid, vid: vid, oid: "oid"});
    }
    self.userManager.clientDisconnect(client.id, vid, cid, action, function(err, obj) {
      if (err) {
        logger.info(err);
        return;
      }

      logger.info('handle disconnect', obj);

      //visitor off
      if (obj.type == 'visitor') {
        self.userManager.findOperators(obj.cid, function (err, operators) {
          if (err || !operators)
            return;

          var socket = null;
          _.each(operators, function (operator) {
            _.each(operator.sockets, function (s) {
              socket = self.io.sockets.connected[s];

              if (socket) {
                logger.log('emit visitor leave,')
                socket.emit(MSGTYPE.VISITOR_LEAVE, {id: obj.uid});

              }

            });
          });
        });
      } else {
        //TODO handle operator offline
      }

      if (obj.action == 'call') {
        self.conekLogger.logchat({
          conek: null,
          from: null,
          content: obj.uuid,
          type: 'call'
        });
        //TODO: inform other clients to close video box
      }

    });
  });

  //pass sdp message
  client.on(MSGTYPE.SDP, function(message) {
    //forward message to receive
    var socket = self.io.sockets.connected[message.to];
    message.from = client.id;
    if (socket) {
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
  this.userManager.addUser(data.type, socket.id, data, function(err, details) {
    if (err) {
      //TODO handle add user's fail
      return;
    }

    if (!details) return;

    logger.info('find emit', details);

    if (data.type == 'operator') {
      //emit all oll visitors to operator
      var ret = [];

      _.each(details.visitors, function (detail) {

        ret.push({
          id: detail.id,
          name: detail.name,
          join: detail.join,
          conek: detail.conek
        });
      });

      socket.emit(MSGTYPE.VISITORS, ret);
    } else { //handle new visitor joins
      logger.info('info visitor join', details);

      if (details.type == 'new') {
        //remove unnecessary information
        delete data.cid;
        delete data.token;
        delete data.key;
        delete data.type;

        var sendSocket;
        _.each(details.operators, function (o) { //each operator
          _.each(o.sockets, function (s) {
            sendSocket = self.io.sockets.connected[s];
            if (sendSocket) {
              sendSocket.emit(MSGTYPE.VISITOR_JOIN, data);
            }
          });
        });
      }
    }

    //if have coneks
    _.each(details.coneks, function(conek) {
      socket.join(conek);

      if (data.type == 'visitor')
        socket.emit('conek', conek);
    });
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
