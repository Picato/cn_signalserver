/**
 * Created by tuan on 02/04/2016.
 */

function ConekLogger(opts) {
  this.client = require('request');
  this.restapi = opts;
  //console.log('init ConekLogger, config=', opts);
}

/**
 * log chat & call
 * @param args
 */
ConekLogger.prototype.logchat = function(args) {
  if (!args) return;

  var type = args.type, content = null, direction = '';
  if (type == 'chat') {
    if (!args.payload) return;
    content = args.payload.content;
    direction = args.payload.from;
  } else {
    content = args.content;
    direction = args.from;
  }

  var log = {
    conek: args.conek,
    from: direction,
    content: content,
    type: type
  }

  this.client.post(this.restapi.chat, {
    json: log
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log(body)
    }
  });
}

ConekLogger.prototype.logmisscall = function(args) {
  var log = {
    conek: args.conek,
    from: args.visitorid ? 'v' : 'o'
  }

  this.client.post(this.restapi.misscall, {
    json: log
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log(body)
    }
  });
};

/**
 * inform Sails Server operator offline
 * @param message
 */
ConekLogger.prototype.operatorOffline = function(message) {
  this.client.post(this.restapi.offline, {
    json: message
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log(body)
    }
  });
};

ConekLogger.prototype.saveUser = function(args) {
  console.log('save visitor to server, args = ', args);
  this.client.post(this.restapi.saveuser, {
    json: args
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log('save visitor to server successfully');
    }
  });
}

module.exports = ConekLogger;
