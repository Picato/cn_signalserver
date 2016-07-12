/**
 * Created by tuan on 02/04/2016.
 */
var logger = require('winston');

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
  var file = null, status = '';
  if (type == 'chat') {
    if (!args.payload) return;
    content = args.payload.content;
    direction = args.payload.from;
    file = args.payload.file;
    status = args.payload.status;
  } else {
    content = args.content;
    direction = args.from;
    file = args.file;
    status = args.status;
  }

  var log = {
    conek: args.conek,
    from: direction,
    content: content,
    type: type
  }
  if (file && file != undefined) {
    if (status == 'sending' || status == 'error')
      return;
    log = {
      conek: args.conek,
      from: direction,
      content: '(file) ' + file.filename,
      type: type
    }
  }
  this.client.post(this.restapi.chat, {
    json: log
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
    } else {
      logger.error('logchat, cannot log', body);
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

    } else {
      logger.error('logmisscall, cannot log', body);
    }
  });
};

/**
 * inform Sails Server operator offline
 * @param message
 */
ConekLogger.prototype.operatorStatus = function(message) {
  this.client.post(this.restapi.status, {
    json: message
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      //console.log(body)
    } else {
      logger.error('operatorOffline, cannot log', body);
    }
  });
};

ConekLogger.prototype.saveUser = function(args) {
  console.log('save visitor to server, args = ', args);
  this.client.post(this.restapi.saveuser, {
    json: args
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      //console.log('save visitor to server successfully');
    } else {
      logger.error('saveUser, cannot log', body);
    }
  });
}

module.exports = ConekLogger;
