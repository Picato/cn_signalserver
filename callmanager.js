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

  this.userManager = new UserManager(config);

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
    var rec = self.io.sockets.connected[message.ts];

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var receiver = self.io.sockets.connected[message.ts];

    //forward accept message
    if (!receiver) {
      logger.error('accept msg, cannot find receiver');
      return;
    }

    receiver.emit(MSGTYPE.ACCEPT, {
      id: client.id,
      resource: client.resources,
      conek: message.conek,
      type: message.type
    });

    //join room
    receiver.join(message.conek);

    //join client socket to room
    client.join(message.conek);

    //inform stun&turn server
    self.sendServerInfoToClient(receiver, self.config);
    self.sendServerInfoToClient(client, self.config);

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
      vsid = receiver.id;
    } else {
      oid = message.tid;
      vid = message.fid;
      osid = receiver.id;
      vsid = client.id;
    }

    self.userManager.setCallPeer(cid, oid, vid, osid, vsid, callId);
  });

  //decline message
  client.on(MSGTYPE.DECLINE, function(message) {
    logger.info('decline msg', message);
    var receiver = self.io.sockets.connected[message.to];

    //inform caller
    if (receiver)
      receiver.emit(MSGTYPE.DECLINE, {type: message.type, from: message.from});

    var conek = message.conek;

    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast decline message to room');
        room.emit(MSGTYPE.DECLINE, message);
      }
    }

    //log miscall
    self.conekLogger.logmisscall(message);
  });

  //busy message
  client.on(MSGTYPE.BUSY, function(message) {
    logger.info('busy msg', message);
    var receiver = self.io.sockets.connected[message.to];
    if (receiver){
      logger.info('emit to talk');
      receiver.emit(MSGTYPE.BUSY, message);
    }

    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast busy to room');
        room.emit(MSGTYPE.BUSY, message);
      }
    }

    //TODO log miscall
    //self.conekLogger.logmisscall(message);
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

  client.on(MSGTYPE.DISCONNECT, function() {
    var type,
      id = client.handshake.query.vid;

    if (id) {
      type = 'visitor';
    } else {
      type = 'operator';
      id = client.handshake.query.oid;
    }

    var cid = client.handshake.query.cid;
    var action = client.handshake.query.type;
    var conek = client.handshake.query.conek;

    logger.info('disconnect id=', id, '  cid=', cid, ' action=', action, ' conek=', conek);

    //inform room
    if (conek != undefined && conek && action == 'call') {
      var room = client.broadcast.to(conek);

      if (room) {
        room.emit(MSGTYPE.CALLOFF, {cid: cid, conek: conek, type: client.handshake.query.from});
      }
    }

    self.userManager.clientDisconnect(type, client.id, id, cid, action, function(err, obj) {
      if (err) {
        logger.error(err);
        return;
      }

      //visitor off
      if (type == 'visitor') {
        self.userManager.findOperators(obj.cid, function (err, operators) {
          if (err || !operators)
            return;

          var socket = null;
          _.each(operators, function (operator) {
            _.each(operator.sockets, function (s) {
              socket = self.io.sockets.connected[s];

              if (socket) {
                socket.emit(MSGTYPE.VISITOR_LEAVE, {id: obj.uid});
              }
            });
          });
        });
      } else {    //operator
        if (obj.coneks) {
          //inform visitor
          _.each(obj.coneks, function(conek) {
            var room = client.broadcast.to(conek);

            if (room) {
              console.log('emit offline operator');
              room.emit(MSGTYPE.OPERATOR_LEAVE);
            }
          });
        }

        //inform sails server  - set offline
        console.log('inform operator offline', obj.uid);
        self.conekLogger.operatorStatus({
          id: obj.uid,
          status: 'offline'
        });
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
  });

  //update visitor infor (eg: name, email ... ) from operator
  client.on(MSGTYPE.UPDATE_VISITOR, function(data) {
    logger.info('updatevisitor', data);
    self.userManager.updateUser(data);
  });

  client.on(MSGTYPE.VISITOR_ACCEPT, function(message) {
    console.log('visitor accept call:', message);
    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast accept call of visitor to room');
        room.emit(MSGTYPE.VISITOR_ACCEPT, message);
      }
    }
  });

  client.on(MSGTYPE.OPERATOR_ACCEPT, function(message) {
    console.log('operator accept call:', message);
    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast accept call of visitor to room');
        room.emit(MSGTYPE.OPERATOR_ACCEPT, message);
      }
    }
  });
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

    //set online for operator
    if (details.type == 'newcustomer' && data.type == 'operator') {
      self.conekLogger.operatorStatus({
        id: data.id,
        status: 'online'
      });
      return;
    }

    if (data.type == 'operator') {
      //emit all oll visitors to operator
      var ret = [];
      _.each(details.visitors, function (detail) {
        ret.push({
          id: detail.id,
          name: detail.name,
          email: detail.email,
          phone: detail.phone,
          note: detail.note,
          tag: detail.tag,
          join: detail.join,
          conek: detail.conek,
          exInfo: detail.exInfo,
          pages: detail.pages
        });

        //conek operator socket <--> visitor socket
        if (detail.conek)
          socket.join(detail.conek);
      });
      socket.emit(MSGTYPE.VISITORS, ret);

      //set operator online
      if (details.type == 'newoperator') {
        self.conekLogger.operatorStatus({
          id: data.id,
          status: 'online'
        });
      }
    } else { //handle new visitor joins
      logger.info('info visitor join', details);

      //remove unnecessary information
      delete data.cid; delete data.token; delete data.key; //delete data.type;

      var sendSocket;
      _.each(details.operators, function (o) { //each operator
        _.each(o.sockets, function (s) {
          sendSocket = self.io.sockets.connected[s];
          if (sendSocket) {
            if (details.type == 'new') {
              data.join = new Date();
              data.pages = details.visitor.pages;
              data.currentPage = details.visitor.currentPage;
              logger.info('emit visitor join ', data);
              sendSocket.emit(MSGTYPE.VISITOR_JOIN, data);
            } else {
              logger.info('visitorpagechange ', data.exInfo.currentPage);
              sendSocket.emit(MSGTYPE.VISITOR_PAGE_CHANGE, {id: data.id, currentPage: data.exInfo.currentPage, pages: details.pages});
            }
          }
        });
      });
      //}
    }

    //if have coneks
    _.each(details.coneks, function(conek) {
      socket.join(conek);
      console.log('on conek', data);
      if (data.type == 'visitor'){
        console.log('emit on conek');
        socket.emit(MSGTYPE.CONEK, conek);
      }
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
