/**
 * Created by tuan on 30/03/2016.
 */
"use strict";

var pub, sub;
pub = sub = require('pubsub-js');
// var redis = require("redis");
// var sub = redis.createClient(), pub = redis.createClient();
var Emitter = require('wildemitter'),
    EVENT = require('./eventtype'),
    CHANNEL = require('./channel');

//constructor
function PubSub() {}

/*
 * Emit to connectionctr
 */
Emitter.mixin(PubSub);

//public function
PubSub.prototype.pubVisitorJoin = function(cid) {
  var channel = CHANNEL.VISITOR_JOIN + ":" + cid;
  pub.publish(channel, 'visitor is joined');
}

PubSub.prototype.subVisitorJoin = function(cid) {
  var self = this;
  var channel = CHANNEL.VISITOR_JOIN + ":" + cid;

  sub.subscribe(channel, function(msg, data) {
    console.log( 'operator join', msg, data );
    self.emit(EVENT.VISITOR_JOIN);
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
 *
 */
PubSub.prototype.pubOperatorJoin = function(cid, operator) {
  var channel = CHANNEL.VISITOR_JOIN + cid;
  pub.publish(channel, operator);
}

/*
 * operators
 * message to all online operators
 */
PubSub.prototype.subOperatorChannel = function (cid) {
  var self = this;
  //channel for all operators of a customer
  var channel = CHANNEL.ALL_OPERATORS + cid;
  sub.subscribe(channel, function(msg, data) {  //msg = channel
    var event = data.event
        msg = data.msg;
    self.emit(event, msg);
  });
}

PubSub.prototype.pubMessageChannel = function(message) {

}

/*
 * assign visitor chat request to specific operator
 */
PubSub.prototype.pubAssignVisitor = function() {

}

PubSub.prototype.pubNewVisitorRequest = function(message) {
    var cid = message.cid;
    var channel = CHANNEL.ALL_OPERATORS + cid;
    pub.publish(channel, {
      event: EVENT.VISITOR_NEW_CONVERSATION,
      msg: message
    });
}

module.exports = PubSub;
