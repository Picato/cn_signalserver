/**
 * Handle all in-coming call & chat
 */
var uuid = require('node-uuid'),
  crypto = require('crypto'),
  UserManager = require('./usermanager');
  MSGTYPE = require('./msgtype'),
  logger = require('winston'),
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
    self.invOperator(client, {
      name: message.name,
      operator: message.operator,
      type: message.type,
      conek: message.conek
    });
  });

  //ringing message
  client.on(MSGTYPE.RINGING, function (message) {
    var rec = self.io.to(message.to);

    //forward message
    rec.emit(MSGTYPE.RINGING, message);
  });

  //accept message
  client.on(MSGTYPE.ACCEPT, function (message) {
    logger.info('accept msg', message);
    var rec = self.io.to(message.to);

    //inform stun & turn server
    if (message.type !== MSGTYPE.CHAT) {
      self.sendServerInfoToClient(client, self.config);
      self.sendServerInfoToClient(rec, self.config);
    }

    //forward accept message
    rec.emit(MSGTYPE.ACCEPT, {
      id: client.id,
      resource: client.resources,
      conek: message.conek,
      type: message.type
    });

    //add client peer
    self.userManager.addPeer(client.id, message.to);
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
}

/**
 * @param operatorId
 * @param socketId: socket id of operator
 */
CallManager.prototype.addUser = function (id, operid) {
  operid ? logger.info('an operator join', id) : logger.info('an visitor join', id);

  //add operator to list
  this.userManager.addUser(id, operid);
}

/**
 * @param vSocketId: visitor socket id
 * @param operatorId: target call/chat
 * @param msgType: chat/call
 */
CallManager.prototype.invOperator = function (vSocket, data) {
  logger.info('receive visitor connect', data);
  var operatorSocket = this.userManager.getOperSocketId(data.operator);
  logger.info('invOperator - get operatorSocketId', operatorSocket);
  if (!operatorSocket) return;

  var oprSocket = this.io.to(operatorSocket);
  if (!oprSocket) return;
  logger.info('invOperator - get operatorSocket');

  var obj = {
    type: data.type,   //
    from: vSocket.id,
    to: operatorSocket,
    name: data.name,
    conek: data.conek
  };

  //invite
  logger.info('invite', obj);
  oprSocket.emit(MSGTYPE.INVITE, obj);

  //send trying back to visitor
  vSocket.emit(MSGTYPE.TRYING, {});
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
  var peers = self.userManager.getPeers(id);
  if (!peers) return;

  peers.forEach(function(peer){
    socket = self.io.to(peer);

    //forward accept message
    socket.emit(MSGTYPE.LEAVE, {
      id: id
    });
  });

  //remote user
  self.userManager.removeUser(id);
}

module.exports = CallManager;
