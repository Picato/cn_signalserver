/**
 * Handle all in-coming call & chat
 */
var crypto = require('crypto'),
  _ = require('lodash'),
  PubSub = require('./pubsub'),
  EVENT = require('./eventtype'),
  RedisUtil = require('./redisutil'),
  logger = require('./log'),
  ConekLogger = require('./coneklogger');

function ConnectionCtr(io, config) {
  this.io = io;
  this.config = config;

  //init conek logger
  this.conekLogger = new ConekLogger(config.logapi);

  var pubsub = this.pubsub = new PubSub();
  this.redisUtil = new RedisUtil();

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
   * subscribe receive channel
   */
  client.on(EVENT.VISITOR_JOIN, function(message) {
    logger.info('visitor join', message);
    var cid = message.cid,
        vid = message.vid;

    if (_.isEmpty(cid) || _.isEmpty(vid))
      return;

    //join room as vid
    client.join(vid);

    //add visitor
    self.redisUtil.addVisitor(cid, message);

    //TODO if new --> pub join event
    self.pubsub.pubVisitorJoin(cid);

    //subscribe receive channel
    self.pubsub.subVisitorChannel(vid);
  });

  /*
   * new conversation
   * if no operator --> publish to smart agent
   *    or --> publish to new chat request
   */
  client.on(EVENT.VISITOR_NEW_CONVERSATION, function(message) {
    var cid = message.cid;
    if (_.isEmpty(cid))
      return;

    //check operator
    //0 --> request smart agent
    //1 --> transfer conversation to the operator
    // > 1 --> send request to all operators
    self.redisUtil.getNumberOperator(cid, function(err, number) {
      if (err) {
        //TODO handle err
        return;
      }
      if (number == 0) {

      } else if (number == 1) {

      } else { //number > 1

      }
    });
  });

  //operator
  client.on(EVENT.OPERATER_JOIN, function(message) {
    logger.info('operator join', message);
    var cid = message.cid,
        oid = message.oid;

    //join room
    client.join(cid);

    //1st operator, --> subscribe related channel
    // else --> get other operators & inform
    var operators = self.redisUtil.getOpeators(cid);
    if (_.isEmpty(visitors)) {
      self.pubsub.subOperatorChannel(cid);
    } else {
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
   * Operator accept conversation request
   * join room then broadcast to other operators
   */
  client.on(EVENT.OPERATOR_ACCEPT_CONVERSATION, function(message) {
    var conId = message.condId;
    if (_.isEmpty(conId))
      return;

    client.join(conId);

    //broadcast
    self.pubsub.pubOperAcceptConversation(cid, oid, conId);
  });

  /*
   * Operator new conversation
   * send msg to visitor then publish to other operators
   */
  client.on(EVENT.OPERATOR_NEW_CONVERSATION, function(message) {

  });

  /*
   * chat message
   */
  client.on(EVENT.MESSAGE, function(message) {
    //publish
    var conId = message.conId;
    if (_.isEmpty(conId))
      return;

    self.pubsub.pubMessageChannel(message);

    //log message
    self.conekLogger.logMessage(message);
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

module.exports = ConnectionCtr;
