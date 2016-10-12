/**
 * Created by tuan on 30/03/2016.
 */
"use strict";

var pub, sub;
pub = sub = require('pubsub-js');
// var redis = require("redis");
// var sub = redis.createClient(), pub = redis.createClient();
var Emitter = require('wildemitter');
var EVENT =  require('./eventtype');

function PubSub() {
}

//add emit
Emitter.mixin(PubSub);

//public function
PubSub.prototype.pubVisitorJoin = function(cid) {
  var channel = EVENT.VISITOR_JOIN + ":" + cid;
  pub.publish(channel, 'visitor is joined');
}

PubSub.prototype.subVisitorJoin = function(cid) {
  var self = this;
  var channel = EVENT.VISITOR_JOIN + ":" + cid;

  sub.subscribe(channel, function(msg, data) {
    console.log( 'operator join', msg, data );
    self.emit('VISITOR_JOIN');
  });
}

module.exports = PubSub;
