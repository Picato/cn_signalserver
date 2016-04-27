/**
 * Created by tuan on 02/04/2016.
 */

function ConekLogger(opts) {
  this.client = require('request');
  this.restapi = opts;
}

ConekLogger.prototype.logchat = function(args) {
  if (!args || !args.payload) return;

  var log = {
    conek: args.conek,
    from: args.payload.from ? args.payload.from : 'o',
    content: args.payload.content
  }

  this.client.post(this.restapi.chat, {
    json: log
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log(body)
    }
  });
}

ConekLogger.prototype.logcall = function(args) {
  this.client.post(this.restapi.call, args, function(data) {

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
}

module.exports = ConekLogger;
