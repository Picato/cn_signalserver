/**
 * Created by tuan on 30/03/2016.
 */
"use strict";

var pub, sub;
pub = sub = require('pubsub-js');
// var redis = require("redis");
// var sub = redis.createClient(), pub = redis.createClient();
var Emitter = require('wildemitter');

//channel
var VISITOR_JOIN = 'visitorjoin';

function PubSub() {
}

//add emit
Emitter.mixin(PubSub);

//public function
PubSub.prototype.pubVisitorJoin = function(cid) {
  var channel = VISITOR_JOIN + ":" + cid;
  pub.publish(channel, 'visitor is joined');
}

PubSub.prototype.subVisitorJoin = function(cid) {
  var self = this;
  var channel = VISITOR_JOIN + ":" + cid;

  sub.subscribe(channel, function(msg, data) {
    console.log( 'operator join', msg, data );
    self.emit('VISITOR_JOIN');
  });
}

/*
 * visitor channel
 */
PubSub.prototype.subVisitorChannel = function(vid) {
  var channel = vid;
  sub.subscribe(channel, function(msg, data) {
    self.emit();
  });
}

/*
 * operators
 * message to all online operators
 */
PubSub.prototype.subOperatorChannel = function (cid) {

}

PubSub.prototype.pubMessageChannel = function(message) {

}


module.exports = PubSub;
