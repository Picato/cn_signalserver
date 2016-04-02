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
    from: args.visitorid ? 'v' : 'o',
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

ConekLogger.prototype.logmisscall = function(args, cb) {
  this.client.post(this.restapi.misscall, args, function(data) {

  });
}

ConekLogger.prototype.logvideocall = function(args, cb) {
  this.client.post(this.restapi.videocall, args, function(data) {

  });
}

ConekLogger.prototype.logmissvideocall = function(args, cb) {
  this.client.post(this.restapi.missvideocall, args, function(data) {

  });
}
module.exports = ConekLogger;
