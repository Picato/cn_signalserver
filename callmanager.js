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

    if (message.vid)  {   //vistor --> operator
      self.invOperator(client, message);
    } else {   //operator --> visitor
      self.invVisitor(client, message);
    }

  });

  //ringing message
  client.on(MSGTYPE.RINGING, function (message) {
    var rec = self.io.to(message.to);

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg--', message);
    var rec = self.io.sockets.connected[message.to];

    //inform stun & turn server
    if (message.type !== MSGTYPE.CHAT) {
      logger.info('send server info');
      self.sendServerInfoToClient(client, self.config);
      self.sendServerInfoToClient(rec, self.config);
    }
    logger.info('rec: ', message.to, message.from);

    //forward accept message
    rec.emit(MSGTYPE.ACCEPT, {
      id: client.id,
      resource: client.resources,
      conek: message.conek,
      type: message.type
    });

    //add client peer
    if (message.type == MSGTYPE.CHAT) {
      self.userManager.addPeerChat(client.id, message.to);
    } else {    //call
      var caller = {
        caller: message.caller,
        callid: message.to
      };
      var callee = {
        id: message.from,     //socket id of callee
        callid: client.id       //socket id callee's call windows
      }
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

    var otherClient = self.io.to(details.to);
    if (!otherClient) return;

    details.from = client.id;
    otherClient.emit('message', details);

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
 * @param id: socket id of operator
 * @param oid: operator id
 */
CallManager.prototype.addUser = function (id, oid) {
  //add operator to list
  this.userManager.addUser(id, oid);
}

/**
 * @param from: visitor socket id
 * @param data message from visitor
 */
CallManager.prototype.invOperator = function (client, data) {
  var self = this;

  logger.info('receive visitor connect', data);
  var operatorSocket = this.userManager.getOperSocketId(data.operator);
  logger.info('invOperator - get operatorSocketId', operatorSocket);
  if (!operatorSocket) return;

  var oprSocket = this.io.sockets.connected[operatorSocket];
  if (!oprSocket) return;

  var obj = {
    vid: data.vid,       //visitor id
    name: data.name,
    conek: data.conek,
    from: client.id,
    to: operatorSocket,
    type: data.type
  };

  //invite
  logger.info('invite', obj);
  oprSocket.emit(MSGTYPE.INVITE, obj);

  //send trying back to visitor
  client.emit(MSGTYPE.TRYING, {});

  //save visitor id
  if (data.type != MSGTYPE.CHAT && data.sid)
    self.userManager.updateVisitor(data.sid, data.vid);
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

  // allow selectively vending turn credentials based on origin.
  //var origin = client.handshake.headers.origin;
  //if (!config.turnorigins || config.turnorigins.indexOf(origin) !== -1) {
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
  //}

  // tell client about turn servers
  client.emit(MSGTYPE.TURNSERVER, credentials);
}

/**
 * @type {CallManager}
 * handle client disconnect
 */
CallManager.prototype.clientDisconnect = function(id) {
  var self = this, socket;
  console.log('handle client disconnected', id);

  //get notify peers
  self.userManager.getCallPeers(id, function(err, type, user) {
    if (err) return;

    if (type == 'user') {
      //inform peer
      var peers = user.peers;

      peers.forEach(function(peer){
        socket = self.io.sockets.connected[peer];

        if (socket)
          socket.emit(MSGTYPE.LEAVE, {
            id: id
          });
      });

      if (!_.isEmpty(user.call)) {
        socket = self.io.sockets.connected[user.call.id];
        if (socket)
          socket.emit(MSGTYPE.OWNERLEAVE, {
            id: id
          });
      }

      //remote user
      self.userManager.removeUser(id);
    } else {  //type = 'call'
      socket = self.io.sockets.connected[user.id];
      if (socket)
        socket.emit(MSGTYPE.CALLOFF, {
          id: id
        });

      socket = self.io.sockets.connected[user.call.peer];
      if (socket)
        socket.emit(MSGTYPE.PEERCALLOFF, {
          id: id
        });

      user.call = {};
    }
  });
}

module.exports = CallManager;
