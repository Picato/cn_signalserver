/**
 * Handle all in-coming call & chat
 */
var uuid = require('node-uuid'),
  crypto = require('crypto'),
  PubSub = require('./pubsub'),
  EVENT = require('./eventtype'),
  RedisUtil = require('./redisutil'),
  logger = require('./log'),
  _ = require('lodash'),
  ConekLogger = require('./coneklogger');

function ConnectionCtr(io, config) {
  this.io = io;
  this.config = config;

  var pubsub = this.pubsub = new PubSub();
  this.redisUtil = new RedisUtil();

  //init conek logger
  this.conekLogger = new ConekLogger(config.logapi);

  //handle notification
  pubsub.on(EVENT.VISITOR_JOIN, function(channel, message) {
    logger.info('receive event visitor join', message);
  });
}

/**
 * @param client: socket client
 * @description: handle all message here
 */
ConnectionCtr.prototype.handleClient = function (client) {
  var self = this;
  client.resources = {screen: false, video: true, audio: false};

  /*
   * visitor join
   * add cid, vid to redis then publish event
   */
  client.on(EVENT.VISITOR_JOIN, function(message) {
    logger.info('visitor join', message);
    var cid = message.cid,
        vid = message.vid,
        page = message.page;

    if (_.isEmpty(cid) || _.isEmpty(vid))
      return;

    //add visitor id
    self.redisUtil.addVisitor(cid, vid);
    self.redisUtil.addVisitorPage(vid, page);

    //pub join event
    self.pubsub.pubVisitorJoin(cid);
  });

  /*
   * new conversation
   * if no operator --> publish to smart agent
   *    or --> publish to new chat request
   */
  client.on(EVENT.VISITOR_NEW_CONVERSATION, function(message) {

  });

  //operator
  client.on(EVENT.OPERATER_JOIN, function(message) {
    logger.info('operator join', message);
    var cid = message.cid,
        oid = message.oid;

    //join room
    client.join(cid);

    //check 1st operator, if yes --> subscribe related channel
    //                    if no --> get other operators & inform
    if (self.redisUtil.isFirstOperator(cid)) {
      self.pubsub.subOperatorChannels();
    } else {
      var operators = self.redisUtil.getOpeators(cid);
      if (!_.isEmpty(visitors))
        client.emit(EVENT.OPERATORS, operators);

      //publish
      self.pubsub.pubOperatorJoin(cid);
    }

    //get visitor info send to the operator
    var visitors = self.redisUtil.getVisitors(cid);
    if (!_.isEmpty(visitors))
      client.emit(EVENT.VISITORS, clients);

    //log to redis
    self.redisUtil.addOperator(cid, oid, client.id);
  });

  /*
   * Operator new conversation
   */
  client.on(EVENT.OPERATOR_NEW_CONVERSATION, function(message) {

  });

  /*
   * chat message
   */
  client.on(EVENT.MESSAGE, function(message) {
    //publish

    //log message
  });

  //ringing message
  client.on(EVENT.RINGING, function (message) {
    var rec = self.io.sockets.connected[message.ts];

    //forward message
    rec.emit(EVENT.RINGING, message);
  });

  //accept message
  client.on(EVENT.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var receiver = self.io.sockets.connected[message.ts];

    //forward accept message
    if (!receiver) {
      logger.error('accept msg, cannot find receiver');
      return;
    }

    receiver.emit(EVENT.ACCEPT, {
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
  client.on(EVENT.DECLINE, function(message) {
    logger.info('decline msg', message);
    var receiver = self.io.sockets.connected[message.to];

    //inform caller
    if (receiver)
      receiver.emit(EVENT.DECLINE, {type: message.type, from: message.from});

    var conek = message.conek;

    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        //console.log('broadcast decline message to room');
        room.emit(EVENT.DECLINE, message);
      }
    }

    //log miscall
    self.conekLogger.logmisscall(message);
  });

  //busy message
  client.on(EVENT.BUSY, function(message) {
    logger.info('busy msg', message);
    var receiver = self.io.sockets.connected[message.to];
    if (receiver){
      logger.info('emit to talk');
      receiver.emit(EVENT.BUSY, message);
    }

    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast busy to room');
        room.emit(EVENT.BUSY, message);
      }
    }

    //TODO log miscall
    //self.conekLogger.logmisscall(message);
  });

  // pass a message to another id
  client.on(EVENT.MESSAGE, function (message) {
    //logger.info('on message', message);
    if (!message || message.type != 'chat') return;

    var room = client.broadcast.to(message.conek);
    if (room) {
      //emit to all sockets
      //trick for mobile, because of payload from mobile is not object, just a content
      if (typeof message.payload != 'object') {
        message.payload = {content: message.payload, from: 'o'};
      }
      room.emit(EVENT.MESSAGE, message);

      self.conekLogger.logchat(message);
    }
  });

  client.on(EVENT.TYPING, function(message) {
    logger.info('on typing', message);
    if (!message) return;

    var room = client.broadcast.to(message.conek);
    if (room) {
      //emit to all sockets
      room.emit(EVENT.TYPING, message);
    }
  });

  client.on(EVENT.CALLOFF, function(message) {
    //console.log("on calloff: ", message);
    var conek = message.conek;
    var cid = message.cid;

    if (conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        room.emit(EVENT.CALLOFF, {cid: cid, conek: conek, type: 'o'});
      }
    }
  });

  client.on(EVENT.DISCONNECT, function() {
    // var type,
    //   id = client.handshake.query.vid;
    //
    // if (id) {
    //   type = 'visitor';
    // } else {
    //   type = 'operator';
    //   id = client.handshake.query.oid;
    // }
    //
    // var cid = client.handshake.query.cid;
    // var action = client.handshake.query.type;
    // var conek = client.handshake.query.conek;
    //
    // //logger.info('disconnect id=', id, '  cid=', cid, ' action=', action, ' conek=', conek);
    // console.log('disconnect id=', id, '  cid=', cid, ' action=', action, ' conek=', conek);
    // //inform room
    // if (conek != undefined && conek && action == 'call') {
    //   var room = client.broadcast.to(conek);
    //
    //   if (room) {
    //     room.emit(EVENT.CALLOFF, {cid: cid, conek: conek, type: client.handshake.query.from});
    //   }
    // }
    //
    // self.userManager.clientDisconnect(type, client.id, id, cid, action, function(err, obj) {
    //   if (err) {
    //     logger.error(err);
    //     return;
    //   }
    //
    //   //visitor off
    //   if (type == 'visitor') {
    //     self.userManager.findOperators(obj.cid, function (err, operators) {
    //       if (err || !operators)
    //         return;
    //
    //       var socket = null;
    //       _.each(operators, function (operator) {
    //         _.each(operator.sockets, function (s) {
    //           socket = self.io.sockets.connected[s];
    //
    //           if (socket) {
    //             socket.emit(EVENT.VISITOR_LEAVE, {id: obj.uid});
    //           }
    //         });
    //       });
    //     });
    //   } else {    //operator
    //     if (obj.coneks) {
    //       //inform visitor
    //       _.each(obj.coneks, function(conek) {
    //         var room = client.broadcast.to(conek);
    //
    //         if (room) {
    //           console.log('emit offline operator');
    //           room.emit(EVENT.OPERATOR_LEAVE);
    //         }
    //       });
    //     }
    //
    //     //inform sails server  - set offline
    //     console.log('inform operator offline', obj.uid);
    //     self.conekLogger.operatorStatus({
    //       id: obj.uid,
    //       status: 'offline'
    //     });
    //   }
    //
    //   if (obj.action == 'call' && obj.uuid) {
    //     self.conekLogger.logchat({
    //       conek: null,
    //       from: null,
    //       content: obj.uuid,
    //       type: 'call'
    //     });
    //     //TODO: inform other clients to close video box
    //   }
    // });
  });

  //pass sdp message
  client.on(EVENT.SDP, function(message) {
    //forward message to receive
    //console.log("onSdp, message=", message);
    var socket = self.io.sockets.connected[message.to];
    message.from = client.id;
    if (socket) {
      socket.emit(EVENT.SDP, message);
    }
  });

  //share screen
  client.on(EVENT.SHARESCREEN, function () {
    client.resources.screen = true;
  });

  client.on(EVENT.UNSHARESCREEN, function () {
    client.resources.screen = false;
  });

  client.on(EVENT.UPDATEUSERID, function(details) {
    logger.info('update id', details);
    self.userManager.updateId(client.id, details.id);
  });

  //update visitor infor (eg: name, email ... ) from operator
  client.on(EVENT.UPDATE_VISITOR, function(data) {
    logger.info('updatevisitor', data);
    self.userManager.updateUser(data);
  });

  client.on(EVENT.VISITOR_ACCEPT, function(message) {
    console.log('visitor accept call:', message);
    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast accept call of visitor to room');
        room.emit(EVENT.VISITOR_ACCEPT, message);
      }
    }
  });

  client.on(EVENT.OPERATOR_ACCEPT, function(message) {
    //console.log('operator accept call:', message);
    var conek = message.conek;
    //inform room
    if (conek != undefined && conek) {
      var room = client.broadcast.to(conek);
      if (room) {
        logger.info('broadcast accept call of visitor to room');
        room.emit(EVENT.OPERATOR_ACCEPT, message);
      }
    }
  });

  client.on(EVENT.VISITOR_ONLINE, function(message) {
    //console.log('+++on visitor online', message);
    var id = message.id;
    var customer = message.customer;
    self.userManager.setVisitorStatus(customer, id, 'online', function(lastStt) {
      if (!lastStt || lastStt != 'online')
        return;

        var operators = self.userManager.getOperatorSockets(customer);
        //console.log('get operator:', operators);
        if (!operators)
          return;
        var socket;
        _.each(operators, function(o) {
          _.each(o.sockets, function(s) {
            socket = self.io.sockets.connected[s];
            if (socket) {
              //console.log('*****send online status');
              socket.emit(EVENT.VISITOR_ONLINE, {id: id});
            }
          });
        });
    });
  });

  client.on(EVENT.VISITOR_IDLE, function(message) {
    //console.log('---on visitor idle', message);
    // var id = message.id;
    // var customer = message.customer;
    // self.userManager.setVisitorStatus(customer, id, 'idle', function(lastStt) {
    //   if (!lastStt || lastStt != 'idle' )
    //     return;
    //
    //     var operators = self.userManager.getOperatorSockets(customer);
    //     //console.log('get operator:', operators);
    //     if (!operators)
    //       return;
    //     var socket;
    //     _.each(operators, function(o) {
    //       _.each(o.sockets, function(s) {
    //         socket = self.io.sockets.connected[s];
    //         if (socket) {
    //           //console.log('******send idle status');
    //           socket.emit(EVENT.VISITOR_IDLE, {id: id});
    //         }
    //       });
    //     });
    // });
  });
}

/**
 * Inform client STUN/TURN's sever information
 * @param client: client socket
 * @param config: configuration of stun & server
 */
ConnectionCtr.prototype.sendServerInfoToClient = function (client, config) {
  // tell client about stun servers
  client.emit(EVENT.STUNSERVER, config.stunservers || []);

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
  client.emit(EVENT.TURNSERVER, credentials);
}

//set operator status, this happened only in mobile when socket reconnect
ConnectionCtr.prototype.setOperatorStatus = function (data) {
  //console.log('Inform operator ', data.id, ' online');
  var self = this;
  self.conekLogger.operatorStatus({
    id: data.id,
    status: 'online'
  });
}

module.exports = ConnectionCtr;
