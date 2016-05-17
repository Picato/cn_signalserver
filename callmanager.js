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

  //handle invite message
  client.on(MSGTYPE.INVITE, function(message) {
    logger.info('invite msg--', message);

    if (message.to == 'o')  {   //vistor --> operator
      self.invOperator(client, message);
    } else {   //operator --> visitor
      self.invVisitor(client, message);
    }
  });

  //ringing message
  client.on(MSGTYPE.RINGING, function (message) {
    var rec = self.io.sockets.connected[message.to];

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var rec = self.io.sockets.connected[message.to];

    logger.info('forward accept msg');
    //forward accept message
    rec.emit(MSGTYPE.ACCEPT, {
      id: client.id,
      resource: client.resources,
      conek: message.conek,
      type: message.type
    });

    //inform stun & turn server
    if (message.type !== MSGTYPE.CHAT) {
      logger.info('send server info');
      self.sendServerInfoToClient(client, self.config);
      self.sendServerInfoToClient(rec, self.config);
    }

    //add client peer
    if (message.type == MSGTYPE.CHAT) {
      self.userManager.addPeerChat(message.oid, message.vid);
    } else {    //call
      var caller = {      //visitor info
        id: message.caller,
        peertalks: message.to,
        talks: client.id,
        conek: message.conek,
        time: new Date().getTime()    //get start time of call
      };
      var callee = {      //operator info
        id: message.callee,
        peertalks: client.id,
        talks: message.to,
        conek: message.conek,
        time: new Date().getTime()
      };
      self.userManager.addPeerCall(caller, callee);
    }
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
  client.on(MSGTYPE.MESSAGE, function (details) {
    logger.info('on message', details);
    if (!details) return;

    //find all sockets
    var sockets = self.userManager.getSendSockets(details);
    if (!sockets || sockets.length == 0) return;

    var peerS;
    _.each(sockets, function(s) {
      peerS = self.io.sockets.connected[s];
      if (!peerS) return;

      details.from = client.id;
      peerS.emit('message', details);
    });

    //handle log chat message
    if (details.type == MSGTYPE.CHAT)
      self.conekLogger.logchat(details);
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
      //TODO handle add user's invalid
      return;
    }

  });
}

/**
 * @param from: visitor socket id
 * @param data message from visitor
 */
CallManager.prototype.invOperator = function (client, data) {
  var self = this;
  var operators = this.userManager.getOperatorSockets(data.cid, data.oid);

  logger.info('invOperator - get operators', operators);
  if (!operators || operators.length == 0) return;

  var obj = {
    vid: data.vid,       //visitor id
    name: data.name,
    conek: data.conek,
    from: client.id,
    type: data.type
  };

  //invite
  logger.info('invite', obj);
  var oprSocket;
  _.each(operators, function(s) {
    oprSocket = self.io.sockets.connected[s];

    if (!oprSocket) return;

    oprSocket.emit(MSGTYPE.INVITE, obj);
  });

  //send trying back to visitor
  client.emit(MSGTYPE.TRYING, {});
}

/**
 * @param from
 * @param data
 */
CallManager.prototype.invVisitor = function(from, data){}

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
